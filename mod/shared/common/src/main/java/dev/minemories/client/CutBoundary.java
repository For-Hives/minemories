package dev.minemories.client;

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

  /**
   * Whether the seal of this cut cell must be seen from both sides. A solid block's cut face
   * replaces its own outer face, seen from outside only; but the seal of an empty cell (a cave, an
   * underground fluid) is also the floor or wall seen from inside it, and a single-sided outward
   * face would show the sky there.
   */
  static boolean sealsBothSides(boolean air, boolean fluid) {
    return air || fluid;
  }

  /**
   * The same quad facing the other way: corners in reverse order (0, 3, 2, 1), each keeping its
   * texture coordinates, so the texture stays in place and the winding, hence the normal, flips.
   */
  static void reverse(float[] xyz, float[] uv, float[] reversedXyz, float[] reversedUv) {
    for (int corner = 0; corner < 4; corner++) {
      int from = (4 - corner) % 4;
      System.arraycopy(xyz, from * 3, reversedXyz, corner * 3, 3);
      System.arraycopy(uv, from * 2, reversedUv, corner * 2, 2);
    }
  }

  static Material material(int y, int terrainTop, boolean air, boolean fluid, boolean opaqueCube) {
    // Keep the original top layer and non-cubic/transparent content (glass, leaves, stairs).
    // Air and underground fluids are sealed only at the cut plane, not filled throughout the
    // volume.
    if (y >= terrainTop || !(air || fluid || opaqueCube)) return Material.NONE;
    return (long) terrainTop - y <= 3 ? Material.DIRT : Material.STONE;
  }
}
