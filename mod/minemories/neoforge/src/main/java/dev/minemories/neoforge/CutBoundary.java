package dev.minemories.neoforge;

/** Export-only cross sections; never changes the world or adds a wall above its surface. */
final class CutBoundary {
  enum Material {
    NONE,
    DIRT,
    STONE
  }

  private CutBoundary() {}

  static boolean onPlane(float[] vertices, int axis, float plane) {
    if (vertices.length != 12 || axis < 0 || axis > 2 || !Float.isFinite(plane)) return false;
    for (int i = 0; i < 4; i++) {
      float coordinate = vertices[i * 3 + axis];
      if (!Float.isFinite(coordinate) || Math.abs(coordinate - plane) > 0.00001f) return false;
    }
    return true;
  }

  static boolean outside(CaptureBounds bounds, int x, int y, int z) {
    return x < bounds.minX()
        || x > bounds.maxX()
        || y < bounds.minY()
        || y > bounds.maxY()
        || z < bounds.minZ()
        || z > bounds.maxZ();
  }

  static Material material(int y, int terrainTop, boolean air, boolean fluid, boolean opaqueCube) {
    // Keep the original top layer and non-cubic/transparent content (glass, leaves, stairs).
    // Air and underground fluids are sealed only at the cut plane, not filled throughout the
    // volume.
    if (y >= terrainTop || !(air || fluid || opaqueCube)) return Material.NONE;
    return (long) terrainTop - y <= 3 ? Material.DIRT : Material.STONE;
  }
}
