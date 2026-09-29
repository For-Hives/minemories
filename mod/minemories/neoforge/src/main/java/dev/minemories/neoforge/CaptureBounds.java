package dev.minemories.neoforge;

record CaptureBounds(int minX, int minY, int minZ, int maxX, int maxY, int maxZ) {
  static final int DEFAULT_RADIUS = 8 * 16;

  static CaptureBounds around(int x, int z, int bottom, int topExclusive, int radius) {
    if (radius < 2 || radius > DEFAULT_RADIUS || topExclusive <= bottom) {
      throw new IllegalArgumentException("Invalid capture bounds");
    }
    return new CaptureBounds(
        x - radius, bottom, z - radius, x + radius, topExclusive - 1, z + radius);
  }
}
