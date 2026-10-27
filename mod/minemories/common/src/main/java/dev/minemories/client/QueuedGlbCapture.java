package dev.minemories.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.minemories.core.CaptureScene;
import dev.minemories.core.SpoolingGlbScene;
import dev.minemories.core.TileGrid;
import dev.minemories.core.TiledSpoolingScene;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * One producer, one worker. Only copied primitives/pixel bands cross this queue, never game
 * objects.
 */
final class QueuedGlbCapture implements AutoCloseable {
  static final int QUEUE_PACKETS = 16;
  static final int MAX_BAND_PIXELS = 65536;
  static final int MAX_BATCH_QUADS = 64;
  // The shared validator allows 4096 nodes, including the mesh node.
  static final int MAX_LIGHTS = 4095;
  private static final int MAX_TEXTURES = 1024;
  private static final long MAX_TEXTURE_PIXELS = 64L * 1024 * 1024;
  private static final long MAX_TEXTURE_BYTES = 64L * 1024 * 1024;
  private final Path exports;
  private final int tileChunks;
  private final ArrayBlockingQueue<Task> queue = new ArrayBlockingQueue<>(QUEUE_PACKETS);
  private final AtomicBoolean cancelled = new AtomicBoolean();
  private final CompletableFuture<Result> completion = new CompletableFuture<>();
  private final CompletionStage<Result> resultView = completion.minimalCompletionStage();
  private final Thread worker;
  private volatile boolean sealing;

  record Preparation(long textureNanos, long geometryNanos, long publicationNanos) {}

  record Result(
      Path file,
      int materials,
      int textures,
      long quads,
      Instant finishedAt,
      Preparation preparation) {}

  private interface Task {}

  private record Begin(String key, int width, int height) implements Task {}

  private record End(String key) implements Task {}

  private record Batch(List<CaptureElement.Quad> quads, List<CaptureElement.Light> lights)
      implements Task {
    private Batch {
      quads = List.copyOf(quads);
      lights = List.copyOf(lights);
    }
  }

  private record Finish(Instant capturedAt, String metadata) implements Task {}

  private record Origin(int x, int y, int z) implements Task {}

  private static final class Band implements Task {
    private final String key;
    private final int row;
    private final int[] pixels;

    private Band(String key, int row, int[] pixels) {
      this.key = key;
      this.row = row;
      this.pixels = pixels.clone();
    }
  }

  private record TextureFile(Path path, Object identity, int bytes, int alpha) {}

  QueuedGlbCapture(Path exports) {
    this(exports, 0);
  }

  QueuedGlbCapture(Path exports, int tileChunks) {
    this.exports = Objects.requireNonNull(exports).toAbsolutePath().normalize();
    if (tileChunks < 0 || tileChunks > TileGrid.MAX_TILE_CHUNKS)
      throw new IllegalArgumentException("Tile size must be between 0 and 16 chunks");
    this.tileChunks = tileChunks;
    worker = new Thread(this::run, "Minemories GLB preparation");
    worker.setDaemon(true);
    worker.start();
  }

  CompletionStage<Result> completion() {
    return resultView;
  }

  boolean done() {
    return completion.isDone();
  }

  boolean offerTexture(String key, int width, int height) throws IOException {
    checkKey(key);
    RenderedTexture.checkDimensions(width, height);
    return offer(new Begin(key, width, height));
  }

  boolean offerRows(String key, int row, int[] pixels) throws IOException {
    checkKey(key);
    if (row < 0 || pixels.length < 1 || pixels.length > MAX_BAND_PIXELS)
      throw new IOException("Texture band limit exceeded");
    // One producer: capacity cannot shrink between this check and offer (the worker only removes).
    if (!ready()) return false;
    return offer(new Band(key, row, pixels));
  }

  boolean offerTextureEnd(String key) throws IOException {
    checkKey(key);
    return offer(new End(key));
  }

  boolean offerGeometry(List<CaptureElement.Quad> quads, List<CaptureElement.Light> lights)
      throws IOException {
    if (quads.size() > MAX_BATCH_QUADS || lights.size() > 128)
      throw new IOException("Geometry packet limit exceeded");
    if (!ready()) return false;
    return offer(new Batch(quads, lights));
  }

  boolean offerOrigin(int x, int y, int z) {
    if (tileChunks == 0) return true;
    return offer(new Origin(x, y, z));
  }

  boolean finish(Instant capturedAt, String metadata) throws IOException {
    Objects.requireNonNull(capturedAt);
    Objects.requireNonNull(metadata);
    if (metadata.length() > CaptureHistory.MAX_METADATA_BYTES)
      throw new IOException("Capture metadata limit exceeded");
    if (!offer(new Finish(capturedAt, metadata))) return false;
    sealing = true;
    return true;
  }

  private static void checkKey(String key) throws IOException {
    Objects.requireNonNull(key);
    if (key.isEmpty()
        || key.length() > 4096
        || key.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 4096)
      throw new IOException("Texture key limit exceeded");
  }

  boolean ready() {
    return !sealing && !cancelled.get() && !completion.isDone() && queue.remainingCapacity() > 0;
  }

  private boolean offer(Task task) {
    return ready() && queue.offer(task);
  }

  private void run() {
    try {
      Path scratch = exports.resolve(".minemories-work");
      CaptureWorkspace.cleanupAbandoned(scratch, 32);
      Result result;
      try (var workspace = new CaptureWorkspace(scratch);
          CaptureScene scene = newScene(workspace.directory())) {
        result = new ConsumerState(workspace.directory(), scene).consume();
      }
      completion.complete(result);
    } catch (Throwable error) {
      completion.completeExceptionally(error);
    } finally {
      queue.clear();
    }
  }

  private CaptureScene newScene(Path directory) throws IOException {
    if (tileChunks > 0)
      return new TiledSpoolingScene(directory, captureLimits(), new TileGrid(tileChunks));
    return new SpoolingGlbScene(directory, captureLimits());
  }

  private static SpoolingGlbScene.Limits captureLimits() {
    var defaults = SpoolingGlbScene.Limits.defaults();
    return new SpoolingGlbScene.Limits(
        defaults.materials(),
        defaults.textures(),
        MAX_LIGHTS,
        defaults.stringBytes(),
        defaults.jsonBytes(),
        defaults.spoolBytes(),
        defaults.fileBytes(),
        defaults.openFiles());
  }

  private final class ConsumerState {
    private final Path directory;
    private final CaptureScene scene;
    private final Map<String, TextureFile> textures = new LinkedHashMap<>();
    private RenderedTexture.Rows active;
    private String activeKey;
    private long pixels, textureBytes;
    private long textureNanos, geometryNanos;
    private String cachedKey;
    private byte[] cachedPng;

    private ConsumerState(Path directory, CaptureScene scene) {
      this.directory = directory;
      this.scene = scene;
    }

    private Result consume() throws IOException, InterruptedException {
      while (true) {
        checkCancelled();
        Task task = queue.take();
        long started = System.nanoTime();
        if (task instanceof Begin begin) startTexture(begin);
        else if (task instanceof Band band) copyBand(band);
        else if (task instanceof End end) endTexture(end);
        else if (task instanceof Origin origin) scene.setOrigin(origin.x, origin.y, origin.z);
        else if (task instanceof Batch batch) geometry(batch);
        else if (task instanceof Finish finish) return publish(finish);
        else throw new IOException("Unknown capture packet");
        long elapsed = System.nanoTime() - started;
        if (task instanceof Batch) geometryNanos += elapsed;
        else textureNanos += elapsed;
      }
    }

    private void startTexture(Begin begin) throws IOException {
      if (active != null || textures.containsKey(begin.key))
        throw new IOException("Duplicate or interleaved texture");
      long amount = (long) begin.width * begin.height;
      if (textures.size() == MAX_TEXTURES || amount > MAX_TEXTURE_PIXELS - pixels)
        throw new IOException("Capture texture budget exceeded");
      active = new RenderedTexture.Rows(begin.width, begin.height);
      activeKey = begin.key;
      pixels += amount;
    }

    private void copyBand(Band band) throws IOException {
      if (active == null || !Objects.equals(activeKey, band.key))
        throw new IOException("Texture band has no matching header");
      active.append(band.row, band.pixels);
    }

    private void endTexture(End end) throws IOException {
      if (active == null || !Objects.equals(activeKey, end.key))
        throw new IOException("Texture end has no matching header");
      var encoded = active.finish();
      byte[] png = encoded.png();
      if (png.length > MAX_TEXTURE_BYTES - textureBytes)
        throw new IOException("Capture PNG budget exceeded");
      Path file = directory.resolve("texture-" + textures.size() + ".png");
      Files.write(file, png, StandardOpenOption.CREATE_NEW);
      BasicFileAttributes attributes =
          Files.readAttributes(file, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
      if (attributes.fileKey() == null) throw new IOException("Texture file identity unavailable");
      textures.put(
          activeKey, new TextureFile(file, attributes.fileKey(), png.length, encoded.alphaMode()));
      textureBytes += png.length;
      active = null;
      activeKey = null;
    }

    private void geometry(Batch batch) throws IOException {
      for (var quad : batch.quads) {
        checkCancelled();
        var material = quad.material();
        TextureFile image = textures.get(material.image());
        if (image == null) throw new IOException("Geometry references an unfinished texture");
        byte[] png = png(material.image(), image);
        int alpha = material.opacity() < 1 ? 2 : Math.max(material.alpha(), image.alpha);
        float[] positions = quad.positions();
        if (alpha != 0) RenderedLayer.separate(positions, quad.layer());
        scene.addQuad(
            material.key() + "#resolved-alpha-" + alpha,
            material.name(),
            material.image(),
            png,
            material.tint(),
            alpha,
            material.emission(),
            material.opacity(),
            positions,
            quad.uvs());
      }
      for (var light : batch.lights) {
        checkCancelled();
        scene.addPointLight(light.x(), light.y(), light.z(), light.color(), light.level());
      }
    }

    private byte[] png(String key, TextureFile file) throws IOException {
      if (Objects.equals(cachedKey, key)) return cachedPng;
      verifyTexture(file);
      byte[] bytes = new byte[file.bytes];
      try (var input = Files.newInputStream(file.path, LinkOption.NOFOLLOW_LINKS)) {
        int offset = 0;
        while (offset < bytes.length) {
          checkCancelled();
          int read = input.read(bytes, offset, bytes.length - offset);
          if (read < 0) throw new IOException("Texture file shortened");
          offset += read;
        }
        if (input.read() != -1) throw new IOException("Texture file grew");
      }
      verifyTexture(file);
      cachedPng = bytes;
      cachedKey = key;
      return bytes;
    }

    private void verifyTexture(TextureFile file) throws IOException {
      var info =
          Files.readAttributes(file.path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
      if (!info.isRegularFile()
          || !Objects.equals(info.fileKey(), file.identity)
          || info.size() != file.bytes) throw new IOException("Capture texture replaced");
    }

    private Result publish(Finish finish) throws IOException {
      long started = System.nanoTime();
      if (active != null) throw new IOException("Capture ends with an unfinished texture");
      if (!scene.hasGeometry()) throw new IOException("Capture has no visible geometry");
      JsonObject metadata = JsonParser.parseString(finish.metadata).getAsJsonObject();
      metadata.addProperty("captureStartedAt", finish.capturedAt.toString());
      if (metadata.has("minemoriesPlayerPosition")) {
        var position = metadata.getAsJsonArray("minemoriesPlayerPosition");
        scene.setPlayerPosition(
            position.get(0).getAsDouble(),
            position.get(1).getAsDouble(),
            position.get(2).getAsDouble());
      }
      Instant[] ended = {null};
      Path saved =
          CaptureHistory.savePrepared(
              exports,
              finish.capturedAt,
              () -> {
                metadata.addProperty(
                    "captureFinishedAt", Objects.requireNonNull(ended[0]).toString());
                return metadata.toString();
              },
              file -> {
                checkCancelled();
                scene.write(file);
                checkCancelled();
                Instant now = Instant.now();
                ended[0] = now.isBefore(finish.capturedAt) ? finish.capturedAt : now;
              });
      return new Result(
          saved,
          scene.materialCount(),
          textures.size(),
          scene.quadCount(),
          Objects.requireNonNull(ended[0]),
          new Preparation(textureNanos, geometryNanos, System.nanoTime() - started));
    }
  }

  private void checkCancelled() throws InterruptedIOException {
    if (cancelled.get() || Thread.currentThread().isInterrupted())
      throw new InterruptedIOException("Capture cancelled");
  }

  @Override
  public void close() {
    if (completion.isDone()) return;
    cancelled.set(true);
    queue.clear();
    worker.interrupt();
  }
}
