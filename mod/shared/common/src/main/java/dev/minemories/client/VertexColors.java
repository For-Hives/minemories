package dev.minemories.client;

/** Renderer colors are ARGB; biome tint is RGB and must not replace their transparency. */
public final class VertexColors {
  private VertexColors() {}

  public static int multiplyTint(int tint, int argb) {
    int red = ((tint >>> 16) & 255) * ((argb >>> 16) & 255) / 255;
    int green = ((tint >>> 8) & 255) * ((argb >>> 8) & 255) / 255;
    int blue = (tint & 255) * (argb & 255) / 255;
    return (red << 16) | (green << 8) | blue;
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
