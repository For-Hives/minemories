package dev.minemories.core;

/** Geometry rules shared by both GLB writers, so they stay byte-for-byte equivalent. */
final class QuadGeometry {
  private QuadGeometry() {}

  /**
   * Writes the face normal into {@code out}, taken from the first non-degenerate triangle of the
   * quad ({@code 0,1,2} then {@code 0,2,3}). Returns false when the quad has no area at all.
   */
  static boolean normal(float[] p, float[] out) {
    return cross(p, 3, 6, out) || cross(p, 6, 9, out);
  }

  private static boolean cross(float[] p, int b, int c, float[] out) {
    double ax = (double) p[b] - p[0], ay = (double) p[b + 1] - p[1], az = (double) p[b + 2] - p[2];
    double bx = (double) p[c] - p[0], by = (double) p[c + 1] - p[1], bz = (double) p[c + 2] - p[2];
    double nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    double length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(length > 0)) return false;
    out[0] = (float) (nx / length);
    out[1] = (float) (ny / length);
    out[2] = (float) (nz / length);
    return true;
  }

  /** Fills the cache key of one corner: position, normal, UV. */
  static void corner(float[] key, float[] p, float[] normal, float[] uv, int corner) {
    key[0] = p[corner * 3];
    key[1] = p[corner * 3 + 1];
    key[2] = p[corner * 3 + 2];
    key[3] = normal[0];
    key[4] = normal[1];
    key[5] = normal[2];
    key[6] = uv[corner * 2];
    key[7] = uv[corner * 2 + 1];
  }
}
