package dev.minemories.client;

/** WCAG 2 relative luminance and contrast ratio, used to check the fixed accent colours. */
final class Contrast {
  private Contrast() {}

  /** Relative luminance (0 black .. 1 white) of an {@code 0xRRGGBB} colour; alpha is ignored. */
  static double luminance(int rgb) {
    return 0.2126 * channel(rgb >> 16) + 0.7152 * channel(rgb >> 8) + 0.0722 * channel(rgb);
  }

  /** Contrast ratio (1 .. 21) between two colours, whichever is lighter. */
  static double ratio(int first, int second) {
    double a = luminance(first);
    double b = luminance(second);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  private static double channel(int value) {
    double c = (value & 0xFF) / 255.0;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
}
