package dev.minemories.neoforge;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.chunk.status.ChunkStatus;
import net.minecraft.world.level.levelgen.Heightmap;

/** All Minecraft references stay in this object on the client, never in the writer's queue. */
final class ProgressiveGameCapture implements ProgressiveCapturePump.Producer {
  private final Minecraft mc;
  private final ClientLevel level;
  private final LocalPlayer player;
  private final PairingClient.CaptureSettings settings;
  private final long resourceEpoch;
  private final Instant started = Instant.now();
  private final QueuedGlbCapture writer;
  private final ProgressiveCapturePump pump;
  private final CapturePixels pixels;
  private final Minemories.SpriteAssets sprites;
  private final Slot sink = new Slot();
  private final RenderedModelCapture models;
  private final Map<Long, Object> chunks = new LinkedHashMap<>();
  private final List<Integer> entities = new ArrayList<>();
  private CaptureBounds bounds;
  private CaptureCursor cursor;
  private CaptureLevelView fluidView;
  private BlockPos min, max, center;
  private int surfaceX, surfaceZ, surfaceFloor, entityIndex;
  private boolean surfaceDone, entitiesScanned, cancelled, suspended;
  private String cancellation;
  private int blocks, entityCount;
  private long frames, maximumStepNanos, overruns;

  ProgressiveGameCapture(Minecraft mc, PairingClient.CaptureSettings settings, long epoch) {
    this.mc = mc;
    level = Objects.requireNonNull(mc.level);
    player = Objects.requireNonNull(mc.player);
    this.settings = settings;
    resourceEpoch = epoch;
    BlockPos position = player.blockPosition();
    bounds =
        CaptureBounds.around(
            position.getX(),
            position.getZ(),
            level.getMinBuildHeight(),
            level.getMaxBuildHeight(),
            settings.options().radius());
    surfaceX = bounds.minX();
    surfaceZ = bounds.minZ();
    surfaceFloor = Math.min(position.getY(), bounds.maxY());
    pixels = new CapturePixels(mc);
    sprites = new Minemories.SpriteAssets(pixels);
    models = new RenderedModelCapture(sink, mc, pixels);
    String metadata = Minemories.currentCaptureMetadata(position).toString();
    writer = new QueuedGlbCapture(settings.directory());
    pump = new ProgressiveCapturePump(this, writer, started, metadata);
  }

  boolean valid(PairingClient.CaptureSettings current, long epoch) {
    return mc.level == level
        && mc.player == player
        && resourceEpoch == epoch
        && settings.equals(current)
        && current.enabled();
  }

  void step(boolean idle) throws IOException {
    if (cancelled || writer.done()) return;
    suspended = !idle;
    if (!idle) return;
    // A renderer/heightmap/GPU row is indivisible; record overruns rather than promising a hard
    // cap.
    long nanos = 2_000_000;
    var budget = new CaptureFrameBudget(System::nanoTime, nanos, 4096);
    pump.step(budget);
    long elapsed = budget.elapsedNanos();
    frames++;
    maximumStepNanos = Math.max(maximumStepNanos, elapsed);
    if (elapsed > nanos) overruns++;
  }

  void cancel(String reason) {
    if (cancelled) return;
    cancelled = true;
    cancellation = reason;
    writer.close();
  }

  boolean done() {
    return writer.done();
  }

  boolean cancelled() {
    return cancelled;
  }

  String cancellation() {
    return cancellation;
  }

  boolean suspended() {
    return suspended;
  }

  QueuedGlbCapture.Result result() {
    return writer.completion().toCompletableFuture().join();
  }

  PairingClient.CaptureSettings settings() {
    return settings;
  }

  long frames() {
    return frames;
  }

  long maximumStepNanos() {
    return maximumStepNanos;
  }

  long overruns() {
    return overruns;
  }

  int blocks() {
    return blocks;
  }

  int entities() {
    return entityCount;
  }

  @Override
  public boolean exhausted() throws IOException {
    if (!surfaceDone || !cursor.done() || !entitiesScanned || entityIndex < entities.size())
      return false;
    for (var entry : chunks.entrySet()) {
      int x = (int) (entry.getKey() >> 32), z = (int) (long) entry.getKey();
      if (level.getChunkSource().getChunk(x, z, ChunkStatus.FULL, false) != entry.getValue())
        throw new IOException("Des chunks ont changé pendant la capture AFK. Elle sera réessayée.");
    }
    return true;
  }

  @Override
  public CaptureElement.Snapshot next() throws IOException {
    if (!surfaceDone) {
      surface();
      return null;
    }
    if (!cursor.done()) {
      CaptureCursor.Cell cell;
      try {
        cell =
            cursor.peek(
                (x, z) -> {
                  try {
                    if (!chunk(x, z)) return null;
                    int top =
                        Math.min(
                            bounds.maxY(),
                            level.getHeight(Heightmap.Types.WORLD_SURFACE, x, z) - 1);
                    int terrain =
                        level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, x, z) - 1;
                    while (terrain >= bounds.minY()
                        && !level.getFluidState(new BlockPos(x, terrain, z)).isEmpty()) terrain--;
                    return new CaptureCursor.Column(top, terrain);
                  } catch (IOException error) {
                    throw new java.io.UncheckedIOException(error);
                  }
                });
      } catch (java.io.UncheckedIOException error) {
        throw error.getCause();
      }
      if (cell == null) return null;
      if (!chunk(cell.x(), cell.z())) throw new IOException("Chunk déchargé pendant la capture.");
      sink.element = new CaptureElement();
      var dispatcher = mc.getBlockEntityRenderDispatcher();
      dispatcher.prepare(level, mc.gameRenderer.getMainCamera(), mc.hitResult);
      blocks +=
          Minemories.captureCell(
              sink,
              sprites,
              models,
              mc,
              dispatcher,
              fluidView,
              new BlockPos(cell.x(), cell.y(), cell.z()),
              min,
              max,
              center,
              cell.terrainTop());
      var result = sink.element.seal();
      cursor.advance();
      return result;
    }
    if (!entitiesScanned) {
      scanEntities();
      return null;
    }
    if (entityIndex >= entities.size()) return null;
    Entity entity = level.getEntity(entities.get(entityIndex++));
    if (!eligible(entity)) return null;
    if (!chunk(entity.getBlockX(), entity.getBlockZ()))
      throw new IOException("Chunk d’entité déchargé pendant la capture.");
    sink.element = new CaptureElement();
    Minemories.captureEntity(models, mc, entity, center);
    entityCount++;
    return sink.element.seal();
  }

  private void surface() throws IOException {
    if (!settings.fullHeight() && chunk(surfaceX, surfaceZ)) {
      int height = level.getHeight(Heightmap.Types.MOTION_BLOCKING_NO_LEAVES, surfaceX, surfaceZ);
      if (height > bounds.minY()) surfaceFloor = Math.min(surfaceFloor, height);
    }
    if (settings.fullHeight() || (surfaceX == bounds.maxX() && surfaceZ == bounds.maxZ())) {
      int bottom =
          settings.fullHeight() ? bounds.minY() : Minemories.captureBottom(bounds, surfaceFloor);
      bounds =
          new CaptureBounds(
              bounds.minX(), bottom, bounds.minZ(), bounds.maxX(), bounds.maxY(), bounds.maxZ());
      min = new BlockPos(bounds.minX(), bounds.minY(), bounds.minZ());
      max = new BlockPos(bounds.maxX(), bounds.maxY(), bounds.maxZ());
      center =
          new BlockPos(
              (min.getX() + max.getX()) / 2,
              (min.getY() + max.getY()) / 2,
              (min.getZ() + max.getZ()) / 2);
      cursor = new CaptureCursor(bounds);
      fluidView = new CaptureLevelView(level, bounds);
      surfaceDone = true;
    } else if (surfaceX == bounds.maxX()) {
      surfaceX = bounds.minX();
      surfaceZ++;
    } else surfaceX++;
  }

  private boolean chunk(int x, int z) throws IOException {
    int cx = Math.floorDiv(x, 16), cz = Math.floorDiv(z, 16);
    long key = ((long) cx << 32) | (cz & 0xffffffffL);
    Object received = level.getChunkSource().getChunk(cx, cz, ChunkStatus.FULL, false);
    Object previous = chunks.get(key);
    if (previous != null && previous != received)
      throw new IOException("Chunk remplacé pendant la capture AFK.");
    if (received == null) return false;
    chunks.put(key, received);
    return true;
  }

  private boolean eligible(Entity entity) {
    return entity != null
        && !entity.isRemoved()
        && !entity.isInvisible()
        && bounds.containsEntity(entity.getX(), entity.getY(), entity.getZ());
  }

  private void scanEntities() throws IOException {
    int examined = 0;
    for (Entity entity : level.entitiesForRendering()) {
      if (++examined > 8192)
        throw new IOException("Trop d’entités chargées pour cette capture AFK.");
      if (!eligible(entity) || !chunk(entity.getBlockX(), entity.getBlockZ())) continue;
      if (entities.size() == 2048) throw new IOException("Trop d’entités dans la zone AFK.");
      entities.add(entity.getId());
    }
    entitiesScanned = true;
  }

  /** Persistent renderer counters, but a distinct bounded copied element for each renderer call. */
  private static final class Slot implements CaptureSink {
    private CaptureElement element;

    @Override
    public void addQuad(
        String key,
        String name,
        String image,
        byte[] png,
        int tint,
        int alpha,
        float emission,
        float opacity,
        float[] xyz,
        float[] uv)
        throws IOException {
      element.addQuad(key, name, image, png, tint, alpha, emission, opacity, xyz, uv);
    }

    @Override
    public void addRenderedQuad(
        String key,
        String name,
        String image,
        byte[] png,
        int tint,
        int alpha,
        float emission,
        float opacity,
        float[] xyz,
        float[] uv,
        int layer)
        throws IOException {
      element.addRenderedQuad(
          key, name, image, png, tint, alpha, emission, opacity, xyz, uv, layer);
    }

    @Override
    public void addPointLight(float x, float y, float z, int color, int level) throws IOException {
      element.addPointLight(x, y, z, color, level);
    }

    @Override
    public boolean hasGeometry() {
      return element.hasGeometry();
    }

    @Override
    public int materialCount() {
      return element.materialCount();
    }

    @Override
    public void write(Path output) {
      throw new IllegalStateException("Client slot is not a writer");
    }
  }

  @Override
  public ProgressiveCapturePump.Pixels pixels(String key) throws IOException {
    return pixels.source(key);
  }
}
