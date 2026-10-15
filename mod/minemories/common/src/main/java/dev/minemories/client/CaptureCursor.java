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

  private void nextColumn() {
    column = null;
    if (x == bounds.maxX()) {
      x = bounds.minX();
      if (z == bounds.maxZ()) done = true;
      else z++;
    } else x++;
  }
}
