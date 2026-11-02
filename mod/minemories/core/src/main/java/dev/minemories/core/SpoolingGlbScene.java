package dev.minemories.core;

import java.io.BufferedOutputStream;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Single-owner scene builder. Input arrays are consumed before return; geometry lives on disk. */
public final class SpoolingGlbScene implements AutoCloseable {
  private String playerExtras = "";

  /** Local player feet, relative to the exported origin. No world coordinates are embedded. */
  public void setPlayerPosition(double x, double y, double z) {
    if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)) return;
    playerExtras = ",\"extras\":{\"minemoriesPlayerPosition\":[" + x + "," + y + "," + z + "]}";
  }

  /** Worst case when no vertex is shared: 4 × (12 + 12 + 8) bytes plus 6 indices. */
  private static final int QUAD_BYTES = 152;

  private static final int STREAM_BUFFER_BYTES = 8192;
  private static final int COPY_BUFFER_BYTES = 64 * 1024;

  /**
   * Limits are checked before accepting data, and again against actual files before publication.
   */
  public record Limits(
      int materials,
      int textures,
      int lights,
      int stringBytes,
      int jsonBytes,
      long spoolBytes,
      long fileBytes,
      int openFiles) {
    public Limits {
      if (materials < 1
          || textures < 1
          || lights < 0
          || stringBytes < 1
          || jsonBytes < 1
          || spoolBytes < 1
          || fileBytes < 28
          || fileBytes > 0xffff_ffffL
          || openFiles < 2
          || openFiles > 64) {
        throw new IllegalArgumentException("Invalid GLB spool limits");
      }
    }

    public static Limits defaults() {
      return new Limits(
          4096, 1024, 128, 4096, 4 * 1024 * 1024, 256L * 1024 * 1024, 200L * 1024 * 1024, 8);
    }
  }

  /** Accepted spool bytes include the JSON, but exclude the separately bounded final file. */
  public record Metrics(
      long spoolBytes, long quads, int materials, int textures, int peakOpenFiles) {}

  private final Limits limits;
  private final Path directory;
  private final Object directoryIdentity;
  private final Map<String, Part> parts = new LinkedHashMap<>();
  private final Map<String, Image> images = new LinkedHashMap<>();
  private final Map<String, Light> lights = new LinkedHashMap<>();
  private final List<StoredFile> files = new ArrayList<>();
  private final Map<Path, OutputStream> streams = new LinkedHashMap<>(16, 0.75f, true);
  private final ByteBuffer vertexBytes = ByteBuffer.allocate(32).order(ByteOrder.LITTLE_ENDIAN);
  private final ByteBuffer indexBytes = ByteBuffer.allocate(24).order(ByteOrder.LITTLE_ENDIAN);
  private final VertexCache cache = new VertexCache();
  private final ChunkRuns.Budget runBudget = new ChunkRuns.Budget();
  private final GlbMetadata metadata = new GlbMetadata();
  private final int[] quadsByCategory = new int[GlbCategory.values().length];
  private final float[] normal = new float[3];
  private final float[] key = new float[8];
  private final byte[] copyBuffer = new byte[COPY_BUFFER_BYTES];
  private final byte[] convertedBuffer = new byte[COPY_BUFFER_BYTES];
  private long spoolBytes;
  private long quads;
  private int peakOpenFiles;
  private boolean closed;
  private boolean failed;
  private boolean sealed;
  private Layout layout;
  private Map<GlbCategory, Quantization.Plan> plans = new java.util.EnumMap<>(GlbCategory.class);
  private StoredFile json;

  public SpoolingGlbScene(Path temporaryParent) throws IOException {
    this(temporaryParent, Limits.defaults());
  }

  public SpoolingGlbScene(Path temporaryParent, Limits limits) throws IOException {
    this.limits = Objects.requireNonNull(limits, "limits");
    Files.createDirectories(temporaryParent);
    directory =
        Files.createTempDirectory(
            temporaryParent.toAbsolutePath().normalize(), ".minemories-spool-");
    Object identity = attributes(directory).fileKey();
    if (identity == null) {
      Files.delete(directory);
      throw new IOException("Spool filesystem must provide file identities");
    }
    directoryIdentity = identity;
  }

  public boolean hasGeometry() {
    return !closed && !failed && quads > 0;
  }

  public int materialCount() {
    return parts.size();
  }

  public Metrics metrics() {
    return new Metrics(spoolBytes, quads, parts.size(), images.size(), peakOpenFiles);
  }

  /** Non-personal technical description written into {@code asset.extras.minemories}. */
  public void setSource(String minecraft, String loader, String mod, String dimension) {
    metadata.setSource(minecraft, loader, mod, dimension);
  }

  public void addQuad(
      String key,
      String materialName,
      String imageKey,
      byte[] png,
      int tint,
      int alphaMode,
      float emission,
      float opacity,
      float[] xyz,
      float[] uv)
      throws IOException {
    addQuad(
        GlbCategory.TERRAIN,
        ChunkRuns.NONE,
        ChunkRuns.NONE,
        key,
        materialName,
        imageKey,
        png,
        tint,
        alphaMode,
        emission,
        opacity,
        xyz,
        uv);
  }

  /** Chunk coordinates are relative to the chunk holding the capture origin, or NONE. */
  public void addQuad(
      GlbCategory category,
      int chunkX,
      int chunkZ,
      String key,
      String materialName,
      String imageKey,
      byte[] png,
      int tint,
      int alphaMode,
      float emission,
      float opacity,
      float[] xyz,
      float[] uv)
      throws IOException {
    try {
      writable();
      if (xyz.length != 12 || uv.length != 8) {
        throw new IllegalArgumentException("Expected 4 xyz and uv vertices");
      }
      for (float value : xyz) if (!Float.isFinite(value)) return;
      for (float value : uv) if (!Float.isFinite(value)) return;
      // A quad without any area renders nothing: drop it instead of writing a zero normal.
      if (!QuadGeometry.normal(xyz, normal)) return;
      checkedString(key);
      String partKey = category.ordinal() + ":" + key;
      Part part = parts.get(partKey);
      if (part == null) {
        if (parts.size() >= limits.materials())
          throw new IOException("GLB material limit exceeded");
        checkedString(materialName);
        checkedString(imageKey);
        Image image = image(imageKey, png);
        int id = parts.size();
        part =
            new Part(
                id,
                category,
                new ChunkRuns(runBudget),
                materialName,
                image,
                tint,
                alphaMode,
                Float.isFinite(emission) ? emission : 0,
                Float.isFinite(opacity) ? opacity : 1,
                create("p" + id + "-positions"),
                create("p" + id + "-normals"),
                create("p" + id + "-uvs"),
                create("p" + id + "-indices"));
        parts.put(partKey, part);
      }
      if (part.vertices > Integer.MAX_VALUE - 4) throw new IOException("GLB vertex limit exceeded");
      if (part.indexCount > Integer.MAX_VALUE - 6)
        throw new IOException("GLB index limit exceeded");
      reserve(QUAD_BYTES);
      part.image.usage.include(uv);
      int before = part.indexCount / 3;
      encode(part, xyz, uv);
      part.runs.record(chunkX, chunkZ, before, part.indexCount / 3);
      quadsByCategory[category.ordinal()]++;
      quads++;
    } catch (IOException error) {
      throw invalidate(error);
    }
  }

  public void addPointLight(float x, float y, float z, int color, int level) throws IOException {
    try {
      writable();
      if (level < 4 || !Float.isFinite(x) || !Float.isFinite(y) || !Float.isFinite(z)) return;
      String key = Math.round(x * 2) + ":" + Math.round(y * 2) + ":" + Math.round(z * 2);
      if (lights.containsKey(key)) return;
      if (lights.size() >= limits.lights()) throw new IOException("GLB light limit exceeded");
      lights.put(key, new Light(x, y, z, color, level));
    } catch (IOException error) {
      throw invalidate(error);
    }
  }

  /** Publishes by atomic replacement only. Any pre-publication failure leaves the target intact. */
  public void write(Path output) throws IOException {
    Path staged = null;
    try {
      usable();
      if (!hasGeometry()) throw new IOException("Cannot write a GLB without geometry");
      Path target = output.toAbsolutePath().normalize();
      if (target.startsWith(directory)) throw new IOException("Output cannot be inside the spool");
      if (!sealed) {
        sealed = true;
        closeStreams();
        optimizeAtlases();
        plans = quantizationPlans();
        layout = layout();
        json = create("scene-json");
        try (JsonSink sink = new JsonSink()) {
          writeJson(sink);
        }
        closeStreams();
      }
      long jsonLength = align4(json.bytes);
      long binaryLength = align4(layout.bytes);
      long total = 28 + jsonLength + binaryLength;
      if (total > limits.fileBytes()) throw new IOException("GLB file limit exceeded");
      verifyFiles();
      Path parent = Objects.requireNonNull(target.getParent(), "Output has no parent");
      Files.createDirectories(parent);
      staged = Files.createTempFile(parent, ".minemories-glb-", ".tmp");
      try (OutputStream out =
          new BufferedOutputStream(
              Files.newOutputStream(staged, StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS),
              COPY_BUFFER_BYTES)) {
        integer(out, 0x46546c67);
        integer(out, 2);
        integer(out, (int) total);
        integer(out, (int) jsonLength);
        integer(out, 0x4e4f534a);
        copy(json, out);
        padding(out, jsonLength - json.bytes, 0x20);
        integer(out, (int) binaryLength);
        integer(out, 0x004e4942);
        long cursor = 0;
        for (Segment segment : layout.segments) {
          padding(out, segment.offset - cursor, 0);
          copy(segment, out);
          cursor = segment.offset + segment.bytes();
        }
        padding(out, binaryLength - cursor, 0);
      }
      interrupted();
      if (Files.size(staged) != total) throw new IOException("Incomplete GLB output");
      Files.move(
          staged, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
      staged = null;
    } catch (IOException error) {
      throw invalidate(error);
    } finally {
      if (staged != null) Files.deleteIfExists(staged);
    }
  }

  private Image image(String key, byte[] png) throws IOException {
    Image known = images.get(key);
    if (png.length == 0) throw new IOException("Empty GLB texture");
    if (known != null) {
      if (known.file.bytes != png.length || !known.digest.equals(digest(png))) {
        throw new IOException("Conflicting GLB texture identity");
      }
      return known;
    }
    if (images.size() >= limits.textures()) throw new IOException("GLB texture limit exceeded");
    reserve(png.length);
    StoredFile file = create("image-" + images.size());
    append(file, png, 0, png.length);
    Image image = new Image(key, file, images.size(), digest(png), new AtlasTexture.Usage(key));
    images.put(key, image);
    return image;
  }

  private void optimizeAtlases() throws IOException {
    for (Image image : images.values()) {
      interrupted();
      if (!image.usage.candidate() || image.file.bytes > AtlasTexture.MAX_BYTES) continue;
      verify(image.file, true);
      byte[] original;
      try (var input = Files.newInputStream(image.file.path, LinkOption.NOFOLLOW_LINKS)) {
        original = input.readNBytes((int) image.file.bytes + 1);
      }
      if (original.length != image.file.bytes)
        throw new IOException("GLB texture changed during optimization");
      byte[] optimized = image.usage.optimize(original);
      if (optimized == original) continue;
      verify(image.file, true);
      try (var out =
          Files.newOutputStream(
              image.file.path,
              StandardOpenOption.WRITE,
              StandardOpenOption.TRUNCATE_EXISTING,
              LinkOption.NOFOLLOW_LINKS)) {
        out.write(optimized);
      }
      spoolBytes -= image.file.bytes - optimized.length;
      image.file.bytes = optimized.length;
    }
  }

  private static String digest(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException("SHA-256 unavailable", error);
    }
  }

  private void checkedString(String value) throws IOException {
    Objects.requireNonNull(value, "GLB name");
    if (value.length() > limits.stringBytes()
        || value.getBytes(StandardCharsets.UTF_8).length > limits.stringBytes()) {
      throw new IOException("GLB name limit exceeded");
    }
  }

  /** Appends only the vertices this primitive has not already emitted, then the triangles. */
  private void encode(Part part, float[] xyz, float[] uv) throws IOException {
    int[] corners = part.corners;
    for (int corner = 0; corner < 4; corner++) {
      QuadGeometry.corner(key, xyz, normal, uv, corner);
      int known = cache.intern(part.id, key, part.vertices);
      if (known < 0) {
        known = part.vertices++;
        vertexBytes.clear();
        for (int axis = 0; axis < 3; axis++) {
          vertexBytes.putFloat(key[axis]);
          part.min[axis] = Math.min(part.min[axis], key[axis]);
          part.max[axis] = Math.max(part.max[axis], key[axis]);
        }
        for (int axis = 3; axis < 6; axis++) vertexBytes.putFloat(key[axis]);
        vertexBytes.putFloat(key[6]).putFloat(key[7]);
        append(part.positions, vertexBytes.array(), 0, 12);
        append(part.normals, vertexBytes.array(), 12, 12);
        append(part.uvs, vertexBytes.array(), 24, 8);
        part.uvFits = part.uvFits && Quantization.uvFits(key[6], key[7]);
      }
      corners[corner] = known;
    }
    indexBytes.clear();
    int emitted = triangle(corners[0], corners[1], corners[2]);
    emitted += triangle(corners[0], corners[2], corners[3]);
    if (emitted > 0) {
      append(part.indices, indexBytes.array(), 0, emitted * 12);
      part.indexCount += emitted * 3;
    }
  }

  private int triangle(int a, int b, int c) {
    // Welding can collapse a triangle of a quad that already had a repeated corner.
    if (a == b || b == c || a == c) return 0;
    indexBytes.putInt(a).putInt(b).putInt(c);
    return 1;
  }

  private StoredFile create(String name) throws IOException {
    directoryIntact();
    Path file = directory.resolve(name);
    availableDescriptor();
    peakOpenFiles = Math.max(peakOpenFiles, streams.size() + 1);
    Files.createFile(file);
    try {
      Object identity = attributes(file).fileKey();
      if (identity == null) throw new IOException("Spool filesystem must provide file identities");
      StoredFile stored = new StoredFile(file, identity);
      files.add(stored);
      return stored;
    } catch (IOException error) {
      try {
        directoryIntact();
        Files.deleteIfExists(file);
      } catch (IOException cleanupError) {
        error.addSuppressed(cleanupError);
      }
      throw error;
    }
  }

  private void append(StoredFile file, byte[] bytes, int offset, int length) throws IOException {
    interrupted();
    directoryIntact();
    reserve(length);
    OutputStream out = streams.get(file.path);
    if (out == null) {
      availableDescriptor();
      verify(file, true);
      out =
          new BufferedOutputStream(
              Files.newOutputStream(
                  file.path, StandardOpenOption.APPEND, LinkOption.NOFOLLOW_LINKS),
              STREAM_BUFFER_BYTES);
      streams.put(file.path, out);
      peakOpenFiles = Math.max(peakOpenFiles, streams.size());
    }
    out.write(bytes, offset, length);
    file.bytes += length;
    spoolBytes += length;
  }

  private void availableDescriptor() throws IOException {
    if (streams.size() == limits.openFiles()) {
      var iterator = streams.entrySet().iterator();
      OutputStream oldest = iterator.next().getValue();
      iterator.remove();
      oldest.close();
    }
  }

  private void reserve(long bytes) throws IOException {
    if (bytes > limits.spoolBytes() - spoolBytes) throw new IOException("GLB spool limit exceeded");
  }

  private void usable() throws IOException {
    if (closed || failed) throw new IOException("GLB spool is closed or invalid");
    interrupted();
    directoryIntact();
  }

  private void writable() throws IOException {
    usable();
    if (sealed) throw new IOException("GLB spool is sealed");
  }

  private static void interrupted() throws InterruptedIOException {
    if (Thread.currentThread().isInterrupted())
      throw new InterruptedIOException("GLB capture interrupted");
  }

  private static BasicFileAttributes attributes(Path path) throws IOException {
    return Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
  }

  private void directoryIntact() throws IOException {
    BasicFileAttributes attributes = attributes(directory);
    if (!attributes.isDirectory() || !Objects.equals(directoryIdentity, attributes.fileKey())) {
      throw new IOException("GLB spool directory changed");
    }
  }

  private static void verify(StoredFile file, boolean size) throws IOException {
    BasicFileAttributes attributes = attributes(file.path);
    if (!attributes.isRegularFile()
        || !Objects.equals(file.identity, attributes.fileKey())
        || (size && attributes.size() != file.bytes)) {
      throw new IOException("GLB spool file changed");
    }
  }

  private void verifyFiles() throws IOException {
    directoryIntact();
    for (StoredFile file : files) verify(file, true);
  }

  private void copy(Segment segment, OutputStream output) throws IOException {
    StoredFile file = segment.file;
    int indexWidth = segment.kind == 3 ? GlbIndices.width(segment.part.vertices) : 4;
    int input = segment.sourceElement(), converted = segment.element();
    boolean convert = input > 0 && converted != input;
    verify(file, true);
    // Final output and one input are the only open files after the append cache is closed.
    peakOpenFiles = Math.max(peakOpenFiles, 2);
    try (var stream = Files.newInputStream(file.path, LinkOption.NOFOLLOW_LINKS)) {
      long remaining = file.bytes;
      // Whole elements only, and the converted block must fit the second buffer.
      int block = convert ? copyBuffer.length / input * input : copyBuffer.length;
      while (remaining > 0) {
        interrupted();
        int requested = (int) Math.min(block, remaining);
        int read = stream.readNBytes(copyBuffer, 0, requested);
        if (read != requested) throw new IOException("Truncated GLB spool");
        if (convert) {
          int written =
              Quantization.convert(segment.kind, copyBuffer, read, convertedBuffer, segment.plan);
          output.write(convertedBuffer, 0, written);
        } else {
          int written = indexWidth < 4 ? GlbIndices.compact(copyBuffer, read, indexWidth) : read;
          output.write(copyBuffer, 0, written);
        }
        remaining -= read;
      }
      if (stream.read() != -1) throw new IOException("GLB spool grew during write");
    }
  }

  private void copy(StoredFile file, OutputStream output) throws IOException {
    verify(file, true);
    peakOpenFiles = Math.max(peakOpenFiles, 2);
    try (var stream = Files.newInputStream(file.path, LinkOption.NOFOLLOW_LINKS)) {
      long remaining = file.bytes;
      while (remaining > 0) {
        interrupted();
        int requested = (int) Math.min(copyBuffer.length, remaining);
        int read = stream.readNBytes(copyBuffer, 0, requested);
        if (read != requested) throw new IOException("Truncated GLB spool");
        output.write(copyBuffer, 0, read);
        remaining -= read;
      }
      if (stream.read() != -1) throw new IOException("GLB spool grew during write");
    }
  }

  private Map<GlbCategory, Quantization.Plan> quantizationPlans() {
    Map<GlbCategory, float[][]> extents = new java.util.EnumMap<>(GlbCategory.class);
    for (Part part : parts.values()) {
      float[][] extent =
          extents.computeIfAbsent(
              part.category,
              ignored ->
                  new float[][] {
                    {Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY},
                    {Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY}
                  });
      for (int axis = 0; axis < 3; axis++) {
        extent[0][axis] = Math.min(extent[0][axis], part.min[axis]);
        extent[1][axis] = Math.max(extent[1][axis], part.max[axis]);
      }
    }
    Map<GlbCategory, Quantization.Plan> result = new java.util.EnumMap<>(GlbCategory.class);
    extents.forEach(
        (category, extent) -> {
          Quantization.Plan plan = Quantization.plan(extent[0], extent[1]);
          if (plan != null) result.put(category, plan);
        });
    return result;
  }

  private static long align4(long value) {
    return (value + 3) & ~3L;
  }

  private static void integer(OutputStream output, int value) throws IOException {
    output.write(value & 255);
    output.write((value >>> 8) & 255);
    output.write((value >>> 16) & 255);
    output.write((value >>> 24) & 255);
  }

  private static void padding(OutputStream output, long bytes, int value) throws IOException {
    for (long index = 0; index < bytes; index++) output.write(value);
  }

  private void closeStreams() throws IOException {
    IOException failure = null;
    for (OutputStream stream : streams.values()) {
      try {
        stream.close();
      } catch (IOException error) {
        if (failure == null) failure = error;
        else failure.addSuppressed(error);
      }
    }
    streams.clear();
    if (failure != null) throw failure;
  }

  private IOException invalidate(IOException error) {
    failed = true;
    try {
      cleanup();
    } catch (IOException cleanupError) {
      error.addSuppressed(cleanupError);
    }
    return error;
  }

  private void cleanup() throws IOException {
    IOException failure = null;
    try {
      closeStreams();
    } catch (IOException error) {
      failure = error;
    }
    if (Files.exists(directory, LinkOption.NOFOLLOW_LINKS)) {
      try {
        directoryIntact();
      } catch (IOException error) {
        throw cleanupFailure(failure, error);
      }
      // Delete only registered files. Never recurse into foreign files or a replaced directory.
      for (StoredFile file : files) {
        try {
          Files.deleteIfExists(file.path);
        } catch (IOException error) {
          failure = cleanupFailure(failure, error);
        }
      }
      try {
        Files.delete(directory);
      } catch (IOException error) {
        failure = cleanupFailure(failure, error);
      }
    }
    if (failure != null) throw failure;
  }

  private static IOException cleanupFailure(IOException failure, IOException error) {
    if (failure == null) return error;
    // A damaged filesystem can fail every deletion; bound the retained diagnostic stack traces.
    if (failure.getSuppressed().length < 8) failure.addSuppressed(error);
    return failure;
  }

  @Override
  public void close() throws IOException {
    closed = true;
    cleanup();
  }

  private Layout layout() {
    List<Segment> segments = new ArrayList<>();
    Map<Image, Integer> imageViews = new LinkedHashMap<>();
    long offset = 0;
    int accessor = 0;
    for (Part part : parts.values()) {
      for (int index = 0; index < 4; index++) {
        StoredFile file =
            switch (index) {
              case 0 -> part.positions;
              case 1 -> part.normals;
              case 2 -> part.uvs;
              default -> part.indices;
            };
        offset = align4(offset);
        Segment segment =
            new Segment(
                file, offset, segments.size(), accessor++, index, part, plans.get(part.category));
        segments.add(segment);
        offset += segment.bytes();
      }
      if (!imageViews.containsKey(part.image)) {
        offset = align4(offset);
        imageViews.put(part.image, segments.size());
        segments.add(new Segment(part.image.file, offset, segments.size(), -1, -1, part, null));
        offset += part.image.file.bytes;
      }
    }
    return new Layout(segments, imageViews, offset);
  }

  private void writeJson(JsonSink sink) throws IOException {
    sink.text(
        "{\"asset\":"
            + metadata.assetJson(quadsByCategory)
            + ",\"scene\":0,\"scenes\":[{\"nodes\":[");
    List<GlbCategory> present = new ArrayList<>();
    for (GlbCategory category : GlbCategory.values()) {
      if (quadsByCategory[category.ordinal()] > 0) present.add(category);
    }
    for (int index = 0; index < present.size() + lights.size(); index++) {
      if (index > 0) sink.text(",");
      sink.text(Integer.toString(index));
    }
    sink.text("]" + playerExtras + "}],\"nodes\":[");
    int index = 0;
    for (GlbCategory category : present) {
      sink.text(
          (index > 0 ? "," : "")
              + "{\"name\":\""
              + category.id()
              + "\""
              + Quantization.transform(plans.get(category))
              + ",\"mesh\":"
              + index++
              + "}");
    }
    int lightId = 0;
    for (Light entry : lights.values()) {
      sink.text(
          (index++ > 0 ? "," : "")
              + "{\"translation\":["
              + entry.x
              + ","
              + entry.y
              + ","
              + entry.z
              + "],\"extensions\":{\"KHR_lights_punctual\":{\"light\":"
              + lightId++
              + "}}}");
    }
    sink.text("],\"meshes\":[");
    int mesh = 0;
    for (GlbCategory category : present) {
      sink.text((mesh++ > 0 ? "," : "") + "{\"name\":\"" + category.id() + "\",\"primitives\":[");
      boolean first = true;
      int partIndex = 0;
      for (Part part : parts.values()) {
        int current = partIndex++;
        if (part.category != category) continue;
        int accessor = current * 4;
        String ranges = part.runs.json();
        sink.text(
            (first ? "" : ",")
                + "{\"attributes\":{\"POSITION\":"
                + accessor
                + ",\"NORMAL\":"
                + (accessor + 1)
                + ",\"TEXCOORD_0\":"
                + (accessor + 2)
                + "},\"indices\":"
                + (accessor + 3)
                + ",\"material\":"
                + current
                + ",\"mode\":4"
                + (ranges == null ? "" : ",\"extras\":{\"minemoriesChunks\":" + ranges + "}")
                + "}");
        first = false;
      }
      sink.text("]}");
    }
    sink.text("],\"materials\":[");
    index = 0;
    for (Part part : parts.values()) {
      if (index++ > 0) sink.text(",");
      float r = ((part.tint >>> 16) & 255) / 255f,
          g = ((part.tint >>> 8) & 255) / 255f,
          b = (part.tint & 255) / 255f;
      sink.text(
          "{\"name\":\""
              + escape(part.name)
              + "\",\"pbrMetallicRoughness\":{\"baseColorFactor\":["
              + r
              + ","
              + g
              + ","
              + b
              + ","
              + part.opacity
              + "],\"baseColorTexture\":{\"index\":"
              + part.image.index
              + "},\"metallicFactor\":0,\"roughnessFactor\":1},\"doubleSided\":true");
      if (part.alphaMode == 2) sink.text(",\"alphaMode\":\"BLEND\"");
      else if (part.alphaMode == 1) sink.text(",\"alphaMode\":\"MASK\",\"alphaCutoff\":0.5");
      if (part.emission > 0) {
        sink.text(
            ",\"emissiveFactor\":["
                + (r * part.emission * 0.65f)
                + ","
                + (g * part.emission * 0.65f)
                + ","
                + (b * part.emission * 0.65f)
                + "],\"emissiveTexture\":{\"index\":"
                + part.image.index
                + "}");
      }
      sink.text("}");
    }
    sink.text("],\"textures\":[");
    index = 0;
    for (Image image : images.values()) {
      if (index++ > 0) sink.text(",");
      sink.text("{\"sampler\":0,\"source\":" + image.index + "}");
    }
    sink.text("],\"images\":[");
    index = 0;
    for (Image image : images.values()) {
      if (index++ > 0) sink.text(",");
      sink.text(
          "{\"name\":\""
              + escape(image.name)
              + "\",\"bufferView\":"
              + layout.imageViews.get(image)
              + ",\"mimeType\":\"image/png\"}");
    }
    sink.text(
        "],\"samplers\":[{\"magFilter\":9728,\"minFilter\":9728,\"wrapS\":10497,\"wrapT\":10497}],\"accessors\":[");
    index = 0;
    for (Segment segment : layout.segments) {
      if (segment.accessor < 0) continue;
      if (index++ > 0) sink.text(",");
      boolean indices = segment.kind == 3;
      String type = indices ? "SCALAR" : segment.kind == 2 ? "VEC2" : "VEC3";
      sink.text(
          "{\"bufferView\":"
              + segment.view
              + ",\"componentType\":"
              + componentType(segment)
              + ",\"count\":"
              + (indices ? segment.part.indexCount : segment.part.vertices)
              + ",\"type\":\""
              + type
              + "\"");
      if (segment.kind == 0) {
        Quantization.Plan plan = segment.plan;
        sink.text(
            plan == null
                ? ",\"min\":" + vector(segment.part.min) + ",\"max\":" + vector(segment.part.max)
                : ",\"min\":"
                    + quantized(segment.part.min, plan)
                    + ",\"max\":"
                    + quantized(segment.part.max, plan));
      } else if (segment.kind == 1 || (segment.kind == 2 && segment.part.uvFits)) {
        sink.text(",\"normalized\":true");
      }
      sink.text("}");
    }
    sink.text("],\"bufferViews\":[");
    index = 0;
    for (Segment segment : layout.segments) {
      if (index++ > 0) sink.text(",");
      sink.text(
          "{\"buffer\":0,\"byteOffset\":" + segment.offset + ",\"byteLength\":" + segment.bytes());
      if (segment.kind >= 0 && segment.kind < 3 && segment.element() != segment.sourceElement()) {
        sink.text(",\"byteStride\":" + segment.element());
      }
      if (segment.kind >= 0) sink.text(",\"target\":" + (segment.kind == 3 ? 34963 : 34962));
      sink.text("}");
    }
    sink.text("],\"buffers\":[{\"byteLength\":" + layout.bytes + "}]");
    sink.text(Quantization.extensions(!lights.isEmpty()));
    if (!lights.isEmpty()) {
      sink.text(",\"extensions\":{\"KHR_lights_punctual\":{\"lights\":[");
      index = 0;
      for (Light light : lights.values()) {
        if (index++ > 0) sink.text(",");
        float r = ((light.color >>> 16) & 255) / 255f,
            g = ((light.color >>> 8) & 255) / 255f,
            b = (light.color & 255) / 255f;
        sink.text(
            "{\"type\":\"point\",\"color\":["
                + r
                + ","
                + g
                + ","
                + b
                + "],\"intensity\":"
                + (light.level * 100.0f)
                + ",\"range\":"
                + Math.max(12, light.level * 1.5f)
                + "}");
      }
      sink.text("]}}");
    }
    sink.text("}");
  }

  private static int componentType(Segment segment) {
    return switch (segment.kind) {
      case 0 -> segment.plan == null ? 5126 : 5122;
      case 1 -> 5120;
      case 2 -> segment.part.uvFits ? 5123 : 5126;
      default -> GlbIndices.componentType(segment.part.vertices);
    };
  }

  private static String quantized(float[] values, Quantization.Plan plan) {
    return "["
        + plan.quantize(values[0], plan.x())
        + ","
        + plan.quantize(values[1], plan.y())
        + ","
        + plan.quantize(values[2], plan.z())
        + "]";
  }

  private static String vector(float[] values) {
    return "[" + values[0] + "," + values[1] + "," + values[2] + "]";
  }

  private static String escape(String value) {
    StringBuilder escaped = new StringBuilder();
    for (int index = 0; index < value.length(); index++) {
      char character = value.charAt(index);
      if (character == '\\' || character == '\"') escaped.append('\\');
      if (character < 0x20) escaped.append(String.format("\\u%04x", (int) character));
      else escaped.append(character);
    }
    return escaped.toString();
  }

  private final class JsonSink implements AutoCloseable {
    void text(String value) throws IOException {
      byte[] bytes = value.getBytes(StandardCharsets.UTF_8);
      if (bytes.length > limits.jsonBytes() - json.bytes)
        throw new IOException("GLB JSON limit exceeded");
      append(json, bytes, 0, bytes.length);
    }

    @Override
    public void close() throws IOException {
      closeStreams();
    }
  }

  private static final class StoredFile {
    final Path path;
    final Object identity;
    long bytes;

    StoredFile(Path path, Object identity) {
      this.path = path;
      this.identity = identity;
    }
  }

  private record Image(
      String name, StoredFile file, int index, String digest, AtlasTexture.Usage usage) {}

  private record Light(float x, float y, float z, int color, int level) {}

  private record Segment(
      StoredFile file,
      long offset,
      int view,
      int accessor,
      int kind,
      Part part,
      Quantization.Plan plan) {
    /** Bytes of one float32 element in the spool, or 0 for indices and images. */
    int sourceElement() {
      return switch (kind) {
        case 0, 1 -> 12;
        case 2 -> 8;
        default -> 0;
      };
    }

    /** Bytes of one element in the published file. */
    int element() {
      return switch (kind) {
        case 0 -> plan == null ? Quantization.FLOAT_POSITION : Quantization.POSITION;
        case 1 -> Quantization.NORMAL;
        case 2 -> part.uvFits ? Quantization.UV : Quantization.FLOAT_UV;
        default -> 0;
      };
    }

    long bytes() {
      if (kind == 3) return file.bytes / 4 * GlbIndices.width(part.vertices);
      return kind < 0 ? file.bytes : (long) part.vertices * element();
    }
  }

  private record Layout(List<Segment> segments, Map<Image, Integer> imageViews, long bytes) {}

  private static final class Part {
    final int id;
    final GlbCategory category;
    final ChunkRuns runs;
    final int[] corners = new int[4];
    boolean uvFits = true;
    final String name;
    final Image image;
    final int tint, alphaMode;
    final float emission, opacity;
    final StoredFile positions, normals, uvs, indices;
    final float[] min = {Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY};
    final float[] max = {Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY};
    int vertices, indexCount;

    Part(
        int id,
        GlbCategory category,
        ChunkRuns runs,
        String name,
        Image image,
        int tint,
        int alphaMode,
        float emission,
        float opacity,
        StoredFile positions,
        StoredFile normals,
        StoredFile uvs,
        StoredFile indices) {
      this.id = id;
      this.category = category;
      this.runs = runs;
      this.name = name;
      this.image = image;
      this.tint = tint;
      this.alphaMode = alphaMode;
      this.emission = emission;
      this.opacity = opacity;
      this.positions = positions;
      this.normals = normals;
      this.uvs = uvs;
      this.indices = indices;
    }
  }
}
