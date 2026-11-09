package dev.minemories.core;

/**
 * Colour conversion shared by both GLB writers. glTF 2.0 stores {@code baseColorFactor}, {@code
 * emissiveFactor} and {@code KHR_lights_punctual} colours as linear values, while Minecraft tints
 * and light colours are 8-bit sRGB. Format 3 writes the linear value; format 2 wrote sRGB as is.
 */
public final class GlbColor {
  private static final float[] LINEAR = new float[256];

  static {
    for (int channel = 0; channel < LINEAR.length; channel++) {
      double value = channel / 255.0;
      // IEC 61966-2-1 piecewise curve.
      LINEAR[channel] =
          (float) (value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4));
    }
  }

  private GlbColor() {}

  /** One 8-bit sRGB channel (only the low byte is read) as a linear value in [0, 1]. */
  public static float srgbToLinear(int channel) {
    return LINEAR[channel & 255];
  }

  /** Linear red, green and blue of an RGB or ARGB colour; the alpha byte is ignored. */
  static float[] linearRgb(int color) {
    return new float[] {srgbToLinear(color >>> 16), srgbToLinear(color >>> 8), srgbToLinear(color)};
  }
}
