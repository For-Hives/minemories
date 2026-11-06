package dev.minemories.client;

/**
 * A cell stays pending until its copied output is admitted; backpressure must never lose a block.
 */
final class CaptureCursor {
  record Column(int top, int terrainTop) {}

  record Cell(int x, int y, int z, int terrainTop) {}

  interface Columns {
    Column get(int x, int z);
  }

  private final CaptureBounds bounds;
  private int x, y, z;
  private Column column;
  private Cell pending;
  private boolean done;

  CaptureCursor(CaptureBounds bounds) {
    long width = (long) bounds.maxX() - bounds.minX() + 1;
    long height = (long) bounds.maxY() - bounds.minY() + 1;
    long depth = (long) bounds.maxZ() - bounds.minZ() + 1;
    if (width < 1
        || height < 1
        || depth < 1
        || width > 257
        || height > 1024
        || depth > 257
        || width * height * depth > 70_000_000)
      throw new IllegalArgumentException("Invalid capture volume");
    this.bounds = bounds;
    x = bounds.minX();
    z = bounds.minZ();
  }

  boolean done() {
    return done;
  }

  Cell peek(Columns columns) {
    if (done) return null;
    if (pending != null) return pending;
    if (column == null) {
      Column next = columns.get(x, z);
      if (next == null || next.top() < bounds.minY()) {
        nextColumn();
        return null;
      }
      column = new Column(Math.min(next.top(), bounds.maxY()), next.terrainTop());
      y = bounds.minY();
    }
    pending = new Cell(x, y, z, column.terrainTop());
    return pending;
  }

  void advance() {
    if (pending == null) throw new IllegalStateException("No pending capture cell");
    pending = null;
    if (y == column.top()) nextColumn();
    else y++;
  }

  /**
   * Chunk-major order: every column of a 16 × 16 chunk before the next chunk, so each primitive of
   * the exported GLB is written chunk by chunk and its triangle ranges stay few.
   */
  private void nextColumn() {
    column = null;
    long chunkMinX = Math.floorDiv((long) x, 16L) * 16L,
        chunkMinZ = Math.floorDiv((long) z, 16L) * 16L;
    long rowEnd = Math.min(chunkMinX + 15, bounds.maxX()),
        colEnd = Math.min(chunkMinZ + 15, bounds.maxZ());
    if (x < rowEnd) {
      x++;
    } else if (z < colEnd) {
      x = (int) Math.max(chunkMinX, bounds.minX());
      z++;
    } else if (chunkMinX + 16 <= bounds.maxX()) {
      x = (int) (chunkMinX + 16);
      z = (int) Math.max(chunkMinZ, bounds.minZ());
    } else if (chunkMinZ + 16 <= bounds.maxZ()) {
      x = bounds.minX();
      z = (int) (chunkMinZ + 16);
    } else {
      done = true;
    }
  }
}
