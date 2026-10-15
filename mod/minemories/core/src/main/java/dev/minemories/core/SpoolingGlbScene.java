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
  private final ByteBuffer quad = ByteBuffer.allocate(QUAD_BYTES).order(ByteOrder.LITTLE_ENDIAN);
  private final byte[] copyBuffer = new byte[COPY_BUFFER_BYTES];
  private long spoolBytes;
  private long quads;
  private int peakOpenFiles;
  private boolean closed;
  private boolean failed;
  private boolean sealed;
  private Layout layout;
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
    try {
      writable();
      if (xyz.length != 12 || uv.length != 8) {
        throw new IllegalArgumentException("Expected 4 xyz and uv vertices");
      }
      for (float value : xyz) if (!Float.isFinite(value)) return;
      for (float value : uv) if (!Float.isFinite(value)) return;
      checkedString(key);
      Part part = parts.get(key);
      if (part == null) {
        if (parts.size() >= limits.materials())
          throw new IOException("GLB material limit exceeded");
        checkedString(materialName);
        checkedString(imageKey);
        Image image = image(imageKey, png);
        int id = parts.size();
        part =
            new Part(
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
        parts.put(key, part);
      }
      if (part.vertices > Integer.MAX_VALUE - 4) throw new IOException("GLB vertex limit exceeded");
      if (part.indexCount > Integer.MAX_VALUE - 6)
        throw new IOException("GLB index limit exceeded");
      reserve(QUAD_BYTES);
      part.image.usage.include(uv);
      encode(part, xyz, uv);
      append(part.positions, quad.array(), 0, 48);
      append(part.normals, quad.array(), 48, 48);
      append(part.uvs, quad.array(), 96, 32);
      append(part.indices, quad.array(), 128, 24);
      for (int vertex = 0; vertex < 4; vertex++) {
        for (int axis = 0; axis < 3; axis++) {
          float value = xyz[vertex * 3 + axis];
          part.min[axis] = Math.min(part.min[axis], value);
          part.max[axis] = Math.max(part.max[axis], value);
        }
      }
      part.vertices += 4;
      part.indexCount += 6;
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
          copy(segment.file, out, segment.kind == 3 ? GlbIndices.width(segment.part.vertices) : 4);
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

  private void encode(Part part, float[] xyz, float[] uv) {
    double ax = (double) xyz[3] - xyz[0],
        ay = (double) xyz[4] - xyz[1],
        az = (double) xyz[5] - xyz[2];
    double bx = (double) xyz[6] - xyz[0],
        by = (double) xyz[7] - xyz[1],
        bz = (double) xyz[8] - xyz[2];
    double nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    double length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length > 0) {
      nx /= length;
      ny /= length;
      nz /= length;
    }
    quad.clear();
    for (float value : xyz) quad.putFloat(value);
    for (int vertex = 0; vertex < 4; vertex++) {
      quad.putFloat((float) nx).putFloat((float) ny).putFloat((float) nz);
    }
    for (float value : uv) quad.putFloat(value);
    int base = part.vertices;
    quad.putInt(base)
        .putInt(base + 1)
        .putInt(base + 2)
        .putInt(base)
        .putInt(base + 2)
        .putInt(base + 3);
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

  private void copy(StoredFile file, OutputStream output) throws IOException {
    copy(file, output, 4);
  }

  private void copy(StoredFile file, OutputStream output, int indexWidth) throws IOException {
    verify(file, true);
    // Final output and one input are the only open files after the append cache is closed.
    peakOpenFiles = Math.max(peakOpenFiles, 2);
    try (var input = Files.newInputStream(file.path, LinkOption.NOFOLLOW_LINKS)) {
      long remaining = file.bytes;
      while (remaining > 0) {
        interrupted();
        int requested = (int) Math.min(copyBuffer.length, remaining);
        int read = input.readNBytes(copyBuffer, 0, requested);
        if (read != requested) throw new IOException("Truncated GLB spool");
        int written = indexWidth < 4 ? GlbIndices.compact(copyBuffer, read, indexWidth) : read;
        output.write(copyBuffer, 0, written);
        remaining -= read;
      }
      if (input.read() != -1) throw new IOException("GLB spool grew during write");
    }
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
        Segment segment = new Segment(file, offset, segments.size(), accessor++, index, part);
        segments.add(segment);
        offset += segment.bytes();
      }
      if (!imageViews.containsKey(part.image)) {
        offset = align4(offset);
        imageViews.put(part.image, segments.size());
        segments.add(new Segment(part.image.file, offset, segments.size(), -1, -1, part));
        offset += part.image.file.bytes;
      }
    }
    return new Layout(segments, imageViews, offset);
  }

  private void writeJson(JsonSink sink) throws IOException {
    sink.text(
        "{\"asset\":{\"version\":\"2.0\",\"generator\":\"Minemories\"},\"scene\":0,\"scenes\":[{\"nodes\":[");
    for (int index = 0; index <= lights.size(); index++) {
      if (index > 0) sink.text(",");
      sink.text(Integer.toString(index));
    }
    sink.text("]}],\"nodes\":[{\"mesh\":0}");
    int index = 0;
    for (Light light : lights.values()) {
      sink.text(
          ",{\"translation\":["
              + light.x
              + ","
              + light.y
              + ","
              + light.z
              + "],\"extensions\":{\"KHR_lights_punctual\":{\"light\":"
              + index++
              + "}}}");
    }
    sink.text("],\"meshes\":[{\"primitives\":[");
    index = 0;
    for (Part part : parts.values()) {
      if (index > 0) sink.text(",");
      int first = index * 4;
      sink.text(
          "{\"attributes\":{\"POSITION\":"
              + first
              + ",\"NORMAL\":"
              + (first + 1)
              + ",\"TEXCOORD_0\":"
              + (first + 2)
              + "},\"indices\":"
              + (first + 3)
              + ",\"material\":"
              + index++
              + ",\"mode\":4}");
    }
    sink.text("]}],\"materials\":[");
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
              + (indices ? GlbIndices.componentType(segment.part.vertices) : 5126)
              + ",\"count\":"
              + (indices ? segment.part.indexCount : segment.part.vertices)
              + ",\"type\":\""
              + type
              + "\"");
      if (segment.kind == 0) {
        sink.text(",\"min\":" + vector(segment.part.min) + ",\"max\":" + vector(segment.part.max));
      }
      sink.text("}");
    }
    sink.text("],\"bufferViews\":[");
    index = 0;
    for (Segment segment : layout.segments) {
      if (index++ > 0) sink.text(",");
      sink.text(
          "{\"buffer\":0,\"byteOffset\":" + segment.offset + ",\"byteLength\":" + segment.bytes());
      if (segment.kind >= 0) sink.text(",\"target\":" + (segment.kind == 3 ? 34963 : 34962));
      sink.text("}");
    }
    sink.text("],\"buffers\":[{\"byteLength\":" + layout.bytes + "}]");
    if (!lights.isEmpty()) {
      sink.text(
          ",\"extensionsUsed\":[\"KHR_lights_punctual\"],\"extensions\":{\"KHR_lights_punctual\":{\"lights\":[");
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
      StoredFile file, long offset, int view, int accessor, int kind, Part part) {
    long bytes() {
      return kind == 3 ? file.bytes / 4 * GlbIndices.width(part.vertices) : file.bytes;
    }
  }

  private record Layout(List<Segment> segments, Map<Image, Integer> imageViews, long bytes) {}

  private static final class Part {
    final String name;
    final Image image;
    final int tint, alphaMode;
    final float emission, opacity;
    final StoredFile positions, normals, uvs, indices;
    final float[] min = {Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY};
    final float[] max = {Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY};
    int vertices, indexCount;

    Part(
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
