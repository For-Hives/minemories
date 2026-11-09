package dev.minemories.client;

/**
 * The End portal and gateway are drawn by a fragment shader that layers the end sky and fifteen
 * rotated, tinted copies of the portal texture over the screen projection, so no texture of theirs
 * can be copied. This bakes one still frame of that shader (game time zero, flat coordinates) from
 * the game's own textures, and maps it on each face of the portal surface.
 */
final class EndPortalLook {
  /** Texture locations in {@code minecraft:}; Minecraft 26.x moved the portal one folder down. */
  static final String SKY = "textures/environment/end_sky.png";

  static final String PORTAL = "textures/entity/end_portal.png";
  static final String KEY = "minemories/procedural/end_portal";
  static final int SIZE = 128;
  private static final int LAYERS = 15;
  // Tints of the shader's COLORS table.
  private static final float[][] COLORS = {
    {0.022087f, 0.098399f, 0.110818f}, {0.011892f, 0.095924f, 0.089485f},
    {0.027636f, 0.101689f, 0.100326f}, {0.046564f, 0.109883f, 0.114838f},
    {0.064901f, 0.117696f, 0.097189f}, {0.063761f, 0.086895f, 0.123646f},
    {0.084817f, 0.111994f, 0.166380f}, {0.097489f, 0.154120f, 0.091064f},
    {0.106152f, 0.131144f, 0.195191f}, {0.097721f, 0.110188f, 0.187229f},
    {0.133516f, 0.138278f, 0.148582f}, {0.070006f, 0.243332f, 0.235792f},
    {0.196766f, 0.142899f, 0.214696f}, {0.047281f, 0.315338f, 0.321970f},
    {0.204675f, 0.390010f, 0.302066f}, {0.080955f, 0.314821f, 0.661491f}
  };

  private EndPortalLook() {}

  /** Whether a render type's name is the End portal or gateway surface. */
  static boolean matches(String renderTypeName) {
    return renderTypeName.contains("end_portal") || renderTypeName.contains("end_gateway");
  }

  /**
   * One frame of the shader as {@code SIZE x SIZE} ABGR pixels (red in the low byte, like the
   * capture's other pixel sources) from the square end sky and portal textures.
   */
  static int[] bake(int[] sky, int skySize, int[] portal, int portalSize) {
    int[] out = new int[SIZE * SIZE];
    for (int y = 0; y < SIZE; y++) {
      for (int x = 0; x < SIZE; x++) {
        float s = (x + 0.5f) / SIZE, t = (y + 0.5f) / SIZE;
        float[] color = new float[3];
        add(color, sample(sky, skySize, s, t), COLORS[0]);
        for (int layer = 1; layer <= LAYERS; layer++) {
          double angle = Math.toRadians((layer * layer * 4321.0 + layer * 9.0) * 2.0);
          double scale = (4.5 - layer / 4.0) * 2.0;
          double sx = 0.5 * s, sy = 0.5 * t;
          double w = 1 + 0.25 * (s + t) + sx * 17.0 / layer;
          double u = scale * (Math.cos(angle) * sx - Math.sin(angle) * sy) / w;
          double v = scale * (Math.sin(angle) * sx + Math.cos(angle) * sy) / w;
          add(color, sample(portal, portalSize, (float) u, (float) v), COLORS[layer - 1]);
        }
        out[y * SIZE + x] =
            0xFF000000
                | (channel(color[2]) << 16)
                | (channel(color[1]) << 8)
                | channel(color[0]);
      }
    }
    return out;
  }

  private static int channel(float value) {
    return Math.min(255, Math.max(0, Math.round(value * 255f)));
  }

  private static void add(float[] color, float sample, float[] tint) {
    for (int i = 0; i < 3; i++) color[i] += sample * tint[i];
  }

  /** Red channel (the portal textures are grey) with the sampler's repeat wrapping. */
  private static float sample(int[] abgr, int size, float u, float v) {
    int x = Math.floorMod((int) Math.floor(u * size), size);
    int y = Math.floorMod((int) Math.floor(v * size), size);
    return (abgr[y * size + x] & 255) / 255f;
  }

  /**
   * Gives a quad of the portal surface (positions only, no UV) planar texture coordinates: the
   * face's two varying axes are stretched over the whole texture. Other primitives are unchanged.
   */
  static RenderedVertices.Vertex[] planar(RenderedVertices.Vertex[] quad) {
    if (quad.length < 4) return quad;
    float[] min = {Float.MAX_VALUE, Float.MAX_VALUE, Float.MAX_VALUE};
    float[] max = {-Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE};
    for (int vertex = 0; vertex < 4; vertex++) {
      float[] position = {quad[vertex].x(), quad[vertex].y(), quad[vertex].z()};
      for (int axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], position[axis]);
        max[axis] = Math.max(max[axis], position[axis]);
      }
    }
    int flat = 0;
    for (int axis = 1; axis < 3; axis++)
      if (max[axis] - min[axis] < max[flat] - min[flat]) flat = axis;
    int a = flat == 0 ? 1 : 0, b = flat == 2 ? 1 : 2;
    RenderedVertices.Vertex[] out = quad.clone();
    for (int vertex = 0; vertex < 4; vertex++) {
      var v = quad[vertex];
      float[] position = {v.x(), v.y(), v.z()};
      out[vertex] =
          new RenderedVertices.Vertex(
              v.x(),
              v.y(),
              v.z(),
              span(position[a], min[a], max[a]),
              span(position[b], min[b], max[b]),
              255,
              255,
              255,
              255);
    }
    return out;
  }

  private static float span(float value, float min, float max) {
    return max > min ? (value - min) / (max - min) : 0f;
  }
}
