package dev.minemories.client;

/**
 * Renderers bake Minecraft's directional face shade into the vertex colour (Create through
 * Flywheel's {@code DiffuseLightCalculator}, vanilla through {@code getShade}). The viewer lights
 * the scene itself, so a grey tint that is exactly that shade for the quad's world normal is
 * removed; any other tint is a real colour and stays.
 */
final class RenderedShade {
  /**
   * Per channel, out of 255: the renderers truncate {@code 255 * shade} and we average 4 corners.
   */
  static final int TOLERANCE = 2;

  private static final int WHITE = 0xFFFFFF;

  private RenderedShade() {}

  /**
   * Returns {@code tint} without the face shade, or unchanged when it is not exactly that shade.
   *
   * @param xyz the quad's four corners in capture space (the capture pose only translates)
   * @param constantAmbient the dimension is lit like the Nether (no darker bottom face)
   */
  static int unshade(int tint, float[] xyz, boolean constantAmbient) {
    if (xyz.length != 12) throw new IllegalArgumentException("Expected a rendered quad");
    double[] normal = normal(xyz);
    if (normal == null) return tint;
    double shade = shade(normal[0], normal[1], normal[2], constantAmbient);
    if (shade >= 1) return tint;
    double expected = 255 * shade;
    for (int shift = 0; shift <= 16; shift += 8)
      if (Math.abs(((tint >>> shift) & 255) - expected) > TOLERANCE) return tint;
    return WHITE;
  }

  /**
   * Flywheel 0.6 {@code RenderMath.diffuseLight}/{@code diffuseLightNether}; exact on axis faces.
   */
  static double shade(double x, double y, double z, boolean constantAmbient) {
    float fx = (float) x, fy = (float) y, fz = (float) z;
    float vertical = constantAmbient ? .9f : (3f + fy) / 4f;
    return Math.min(fx * fx * .6f + fy * fy * vertical + fz * fz * .8f, 1f);
  }

  /**
   * Same rule as the GLB writer: first non-degenerate triangle {@code 0,1,2} then {@code 0,2,3}.
   */
  private static double[] normal(float[] p) {
    double[] normal = cross(p, 3, 6);
    return normal != null ? normal : cross(p, 6, 9);
  }

  private static double[] cross(float[] p, int b, int c) {
    double ax = (double) p[b] - p[0], ay = (double) p[b + 1] - p[1], az = (double) p[b + 2] - p[2];
    double bx = (double) p[c] - p[0], by = (double) p[c + 1] - p[1], bz = (double) p[c + 2] - p[2];
    double nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    double length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(length > 0) || !Double.isFinite(length)) return null;
    return new double[] {nx / length, ny / length, nz / length};
  }
}
