package dev.minemories.client;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.world.level.Level;

/**
 * Blocks the client stores somewhere else than where it draws them: a physics ship, a plane or a
 * car whose blocks live in a far "plot" of the same level and are drawn moved and turned. The
 * capture walks {@code cells} like terrain and draws what it finds at {@code placement}.
 *
 * @param source mod that owns the volume, for logs and limits
 * @param cells storage cells to walk (inclusive), in the level's own block coordinates
 * @param owns whether a storage chunk column belongs to this volume (plots are shared grids)
 */
record CaptureVolume(String source, CaptureBounds cells, Placement placement, Owner owns) {
  private static final org.slf4j.Logger LOGGER = com.mojang.logging.LogUtils.getLogger();

  /** Volumes past these limits are skipped with a log line; the rest of the capture is kept. */
  static final int MAX_VOLUMES = 256;

  static final long MAX_CELLS = 8_000_000L;

  interface Owner {
    boolean chunk(int chunkX, int chunkZ);
  }

  /**
   * One mod's way of finding its volumes. An implementation stays optional: a missing mod returns
   * nothing, an API it no longer recognizes returns nothing and logs why once.
   */
  interface Source {
    List<CaptureVolume> intersecting(Level level, CaptureBounds world);
  }

  /** Every integration, in a fixed order. Add one line for a new physics or ship mod. */
  private static final List<Source> SOURCES = List.of(new SableVolumes());

  long cellCount() {
    return ((long) cells.maxX() - cells.minX() + 1)
        * ((long) cells.maxY() - cells.minY() + 1)
        * ((long) cells.maxZ() - cells.minZ() + 1);
  }

  boolean contains(double x, double y, double z) {
    return cells.containsEntity(x, y, z)
        && owns.chunk(
            Math.floorDiv((int) Math.floor(x), 16), Math.floorDiv((int) Math.floor(z), 16));
  }

  /** The volumes drawn inside the capture box, within the per-capture limits. */
  static List<CaptureVolume> around(Level level, CaptureBounds world) {
    List<CaptureVolume> found = new ArrayList<>();
    for (Source source : SOURCES) found.addAll(source.intersecting(level, world));
    return within(found);
  }

  static List<CaptureVolume> within(List<CaptureVolume> found) {
    List<CaptureVolume> kept = new ArrayList<>();
    long cells = 0;
    int skipped = 0;
    for (CaptureVolume volume : found) {
      long size = volume.cellCount();
      if (kept.size() >= MAX_VOLUMES || size > MAX_CELLS - cells) {
        skipped++;
        continue;
      }
      cells += size;
      kept.add(volume);
    }
    if (skipped > 0)
      LOGGER.warn(
          "Moving structures over capture limits: kept={}, skipped={}", kept.size(), skipped);
    return kept;
  }
}
