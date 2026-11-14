package dev.minemories.client.volume;

import dev.minemories.client.CaptureBounds;
import dev.minemories.client.CaptureSink;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.Entity;

/**
 * Walks the detached volumes of a capture one step at a time: every cell of a volume through the
 * terrain code, then the entities stored in it (a Create contraption on a plane, a seat, a
 * passenger stored with the ship), all moved by a {@link PlacedSink}. The manual export runs it to
 * the end, the AFK capture one step per call.
 */
public final class VolumeCapture {
  static final int MAX_ENTITIES = 2048;

  private static final org.slf4j.Logger LOGGER = com.mojang.logging.LogUtils.getLogger();

  /**
   * The capture's ordinary block and entity code, and the level it reads. It writes relative to
   * {@code origin}, a block of the volume's storage, into the placed sink it is handed.
   */
  public interface Walker {
    /** Every entity the client would draw, wherever it is stored. */
    Iterable<Entity> entities();

    /** The entity of that id, or null once it is gone. */
    Entity entity(int id);

    /** Captures one storage cell of {@code volume}; returns how many blocks it wrote. */
    int cell(CaptureSink placed, CaptureVolume volume, BlockPos pos, BlockPos origin)
        throws IOException;

    /** Captures one entity stored in a volume. */
    void entity(CaptureSink placed, Entity entity, BlockPos origin) throws IOException;
  }

  private final List<CaptureVolume> volumes;
  private final int[] center;
  private int index = -1;
  private CaptureVolume volume;
  private int x, y, z;
  private boolean cellsDone;
  private List<Integer> stored;
  private int storedIndex, blocks, entities;
  private boolean entitiesCapped;

  public VolumeCapture(List<CaptureVolume> volumes, BlockPos center) {
    this.volumes = List.copyOf(volumes);
    this.center = new int[] {center.getX(), center.getY(), center.getZ()};
    open();
  }

  public boolean done() {
    return volume == null;
  }

  public int blocks() {
    return blocks;
  }

  public int entities() {
    return entities;
  }

  public int volumes() {
    return volumes.size();
  }

  /** Captures the next cell or stored entity of the current volume into {@code sink}. */
  public void step(CaptureSink sink, Walker walker) throws IOException {
    if (volume == null) return;
    PlacedSink placed = new PlacedSink(sink, volume.placement(), volume.cells(), center);
    int[] origin = placed.origin();
    BlockPos local = new BlockPos(origin[0], origin[1], origin[2]);
    if (!cellsDone) {
      BlockPos pos = new BlockPos(x, y, z);
      if (!volume.owns().chunk(Math.floorDiv(x, 16), Math.floorDiv(z, 16))) {
        y = volume.cells().maxY();
        nextCell();
        return;
      }
      CaptureVolume current = volume;
      nextCell();
      blocks += walker.cell(placed, current, pos, local);
      return;
    }
    if (stored == null) {
      stored = storedEntities(walker);
      return;
    }
    if (storedIndex >= stored.size()) {
      open();
      return;
    }
    Entity entity = walker.entity(stored.get(storedIndex++));
    if (entity == null || entity.isRemoved() || entity.isInvisible()) return;
    if (entities >= MAX_ENTITIES) {
      if (!entitiesCapped) LOGGER.warn("Moving structures hold too many entities; extras skipped");
      entitiesCapped = true;
      return;
    }
    entities++;
    walker.entity(placed, entity, local);
  }

  private List<Integer> storedEntities(Walker walker) {
    List<Integer> ids = new ArrayList<>();
    for (Entity entity : walker.entities()) {
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
