package dev.minemories.client;

record CaptureBounds(int minX, int minY, int minZ, int maxX, int maxY, int maxZ) {
  static final int DEFAULT_RADIUS = 8 * 16;

  /** Include a whole frozen model when its anchor is inside the selected block volume. */
  boolean containsEntity(double x, double y, double z) {
    return Double.isFinite(x)
        && Double.isFinite(y)
        && Double.isFinite(z)
        && x >= minX
        && x < (double) maxX + 1
        && y >= minY
        && y < (double) maxY + 1
        && z >= minZ
        && z < (double) maxZ + 1;
  }

  static CaptureBounds around(int x, int z, int bottom, int topExclusive, int radius) {
    if (radius < 2 || radius > DEFAULT_RADIUS || topExclusive <= bottom) {
      throw new IllegalArgumentException("Invalid capture bounds");
    }
    return new CaptureBounds(
        x - radius, bottom, z - radius, x + radius, topExclusive - 1, z + radius);
  }

  /**
   * Grow the horizontal footprint to whole tile columns so that every tile of the capture is
   * complete: a later capture can then replace a tile without losing the rest of it. Footprints
   * that would exceed the 257-block capture limit are kept as they are.
   */
  CaptureBounds alignedToTiles(int tileBlocks) {
    long alignedMinX = Math.floorDiv((long) minX, tileBlocks) * tileBlocks;
    long alignedMinZ = Math.floorDiv((long) minZ, tileBlocks) * tileBlocks;
    long alignedMaxX = Math.floorDiv((long) maxX, tileBlocks) * tileBlocks + tileBlocks - 1;
    long alignedMaxZ = Math.floorDiv((long) maxZ, tileBlocks) * tileBlocks + tileBlocks - 1;
    if (alignedMaxX - alignedMinX > 256
        || alignedMaxZ - alignedMinZ > 256
        || alignedMinX < Integer.MIN_VALUE
        || alignedMinZ < Integer.MIN_VALUE
        || alignedMaxX > Integer.MAX_VALUE
        || alignedMaxZ > Integer.MAX_VALUE) return this;
    return new CaptureBounds(
        (int) alignedMinX, minY, (int) alignedMinZ, (int) alignedMaxX, maxY, (int) alignedMaxZ);
  }
}
