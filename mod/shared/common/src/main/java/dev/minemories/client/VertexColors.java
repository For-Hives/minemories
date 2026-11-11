package dev.minemories.client;

/** Renderer colors are ARGB; biome tint is RGB and must not replace their transparency. */
public final class VertexColors {
  private VertexColors() {}

  /**
   * RGB of a {@code BlockColors} result. Fixed tints can be opaque ARGB (1.21.x spruce {@code
   * 0xFF619961}, birch, lily pad) and must keep their colour; -1 ("no tint") stays white.
   */
  public static int blockTint(int color) {
    return color & 0xFFFFFF;
  }

  public static int multiplyTint(int tint, int argb) {
    int red = ((tint >>> 16) & 255) * ((argb >>> 16) & 255) / 255;
    int green = ((tint >>> 8) & 255) * ((argb >>> 8) & 255) / 255;
    int blue = (tint & 255) * (argb & 255) / 255;
    return (red << 16) | (green << 8) | blue;
  }

  /**
   * The colour a quad is drawn with besides its block tint, as RGB with full alpha. Vanilla's
   * {@code putBulkData} multiplies the colour stored in each baked vertex (int 3, ABGR) into the
   * block tint, so a model that bakes its green into the vertices (NeoForge {@code face_data}
   * colours, quads built by code) is green in game and must be here. A platform that already read
   * the colour itself (Fabric meshes) passes it as {@code explicit} and wins; a vertex whose alpha
   * byte is 0 holds no colour (the layouts that do not store one) and counts as white. Baked alpha
   * is ignored: the block renderer does not read it.
   */
  public static int quadColor(int explicit, int[] vertices, int stride) {
    if (explicit != 0xFFFFFFFF) return explicit;
    int red = 0, green = 0, blue = 0, count = 0;
    for (int base = 3; base < vertices.length; base += stride) {
      int abgr = vertices[base];
      if ((abgr >>> 24) == 0) {
        red += 255;
        green += 255;
        blue += 255;
      } else {
        red += abgr & 255;
        green += (abgr >>> 8) & 255;
        blue += (abgr >>> 16) & 255;
      }
      count++;
    }
    if (count == 0) return explicit;
    return 0xFF000000 | ((red / count) << 16) | ((green / count) << 8) | (blue / count);
  }

  public static int averageArgb(int first, int second, int third, int fourth) {
    int alpha = 0, red = 0, green = 0, blue = 0;
    for (int color : new int[] {first, second, third, fourth}) {
      alpha += color >>> 24;
      red += (color >>> 16) & 255;
      green += (color >>> 8) & 255;
      blue += color & 255;
    }
    return ((alpha / 4) << 24) | ((red / 4) << 16) | ((green / 4) << 8) | (blue / 4);
  }
}
