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
}
