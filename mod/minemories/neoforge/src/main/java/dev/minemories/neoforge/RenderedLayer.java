package dev.minemories.neoforge;

/** Ray renderers can skip a base surface behind a transparent, exactly coplanar collar/overlay. */
final class RenderedLayer {
  private RenderedLayer() {}

  static void separate(float[] xyz, int layer) {
    if (xyz.length != 12) throw new IllegalArgumentException("Expected a rendered quad");
    if (layer <= 0) return;
    double ax = (double) xyz[3] - xyz[0],
        ay = (double) xyz[4] - xyz[1],
        az = (double) xyz[5] - xyz[2];
    double bx = (double) xyz[6] - xyz[0],
        by = (double) xyz[7] - xyz[1],
        bz = (double) xyz[8] - xyz[2];
    double nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    double length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (!(length > 0) || !Double.isFinite(length)) return;
    // At most a quarter Minecraft texture pixel. The first overlay is separated by 2 mm.
    double distance = .002 * Math.min(layer, 8) / length;
    for (int index = 0; index < 4; index++) {
      xyz[index * 3] += (float) (nx * distance);
      xyz[index * 3 + 1] += (float) (ny * distance);
      xyz[index * 3 + 2] += (float) (nz * distance);
    }
  }
}
