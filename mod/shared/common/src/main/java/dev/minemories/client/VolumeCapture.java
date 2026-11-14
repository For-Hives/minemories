package dev.minemories.client;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.Entity;

/**
 * Walks the detached volumes of a capture one step at a time: every cell of a volume through the
 * terrain code, then the entities stored in it (a Create contraption on a plane, a seat, a
 * passenger stored with the ship), all moved by a {@link PlacedSink}. The manual export runs it to
 * the end, the AFK capture one step per call.
 */
final class VolumeCapture {
  static final int MAX_ENTITIES = 2048;

  private static final org.slf4j.Logger LOGGER = com.mojang.logging.LogUtils.getLogger();

  private final Minecraft mc;
  private final ClientLevel level;
  private final List<CaptureVolume> volumes;
  private final int[] center;
  private int index = -1;
  private CaptureVolume volume;
  private CaptureLevelView view;
  private CutBoundary.OpenAir sky;
  private int x, y, z;
  private boolean cellsDone;
  private List<Integer> stored;
  private int storedIndex, blocks, entities;
  private boolean entitiesCapped;

  VolumeCapture(Minecraft mc, List<CaptureVolume> volumes, BlockPos center) {
    this.mc = mc;
    this.level = Objects.requireNonNull(mc.level, "No capture level");
    this.volumes = List.copyOf(volumes);
    this.center = new int[] {center.getX(), center.getY(), center.getZ()};
    open();
  }

  boolean done() {
    return volume == null;
  }

  int blocks() {
    return blocks;
  }

  int entities() {
    return entities;
  }

  int volumes() {
    return volumes.size();
  }

  /** Captures the next cell or stored entity of the current volume into {@code sink}. */
  void step(CaptureSink sink, ClientRuntime.SpriteAssets sprites, RenderedModelCapture models)
      throws IOException {
    if (volume == null) return;
    PlacedSink placed = new PlacedSink(sink, volume.placement(), volume.cells(), center);
    int[] origin = placed.origin();
    BlockPos local = new BlockPos(origin[0], origin[1], origin[2]);
    if (!cellsDone) {
      CaptureBounds cells = volume.cells();
      BlockPos pos = new BlockPos(x, y, z);
      if (!volume.owns().chunk(Math.floorDiv(x, 16), Math.floorDiv(z, 16))) {
        y = cells.maxY();
        nextCell();
        return;
      }
      nextCell();
      models.through(
          placed,
          () ->
              blocks +=
                  ClientRuntime.captureCell(
                      placed,
                      sprites,
                      models,
                      mc,
                      mc.getBlockEntityRenderDispatcher(),
                      view,
                      pos,
                      new BlockPos(cells.minX(), cells.minY(), cells.minZ()),
                      new BlockPos(cells.maxX(), cells.maxY(), cells.maxZ()),
                      local,
                      sky));
      return;
    }
    if (stored == null) {
      stored = storedEntities();
      return;
    }
    if (storedIndex >= stored.size()) {
      open();
      return;
    }
    Entity entity = level.getEntity(stored.get(storedIndex++));
    if (entity == null || entity.isRemoved() || entity.isInvisible()) return;
    if (entities >= MAX_ENTITIES) {
      if (!entitiesCapped) LOGGER.warn("Moving structures hold too many entities; extras skipped");
      entitiesCapped = true;
      return;
    }
    entities++;
    models.through(placed, () -> ClientRuntime.captureEntity(models, mc, entity, local));
  }

  private List<Integer> storedEntities() {
    List<Integer> ids = new ArrayList<>();
    for (Entity entity : level.entitiesForRendering()) {
      if (!entity.isRemoved()
          && !entity.isInvisible()
          && volume.contains(entity.getX(), entity.getY(), entity.getZ())) ids.add(entity.getId());
    }
    return ids;
  }

  private void open() {
    index++;
    if (index >= volumes.size()) {
      volume = null;
      return;
    }
    volume = volumes.get(index);
    CaptureBounds cells = volume.cells();
    view = new CaptureLevelView(level, cells);
    sky = CutBoundary.OpenAir.sky(cells);
    x = cells.minX();
    y = cells.minY();
    z = cells.minZ();
    cellsDone = false;
    stored = null;
    storedIndex = 0;
  }

  /** Column by column, so a column outside the volume's plot is skipped in one step. */
  private void nextCell() {
    CaptureBounds cells = volume.cells();
    if (y < cells.maxY()) {
      y++;
      return;
    }
    y = cells.minY();
    if (x < cells.maxX()) {
      x++;
      return;
    }
    x = cells.minX();
    if (z < cells.maxZ()) {
      z++;
      return;
    }
    cellsDone = true;
  }
}
