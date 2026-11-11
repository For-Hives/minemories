package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class UiThemeTest {
  /** A dark panel (vanilla list background) and a light one (a pack that lightens it). */
  private static final int DARK_PANEL = 0x202020;

  private static final int LIGHT_PANEL = 0xE6E6E6;

  /** WCAG minimum for large text and interface components. */
  private static final double MINIMUM = 3.0;

  @Test
  void luminanceOfBlackAndWhite() {
    assertEquals(0.0, Contrast.luminance(0x000000), 1e-9);
    assertEquals(1.0, Contrast.luminance(0xFFFFFF), 1e-9);
    assertEquals(21.0, Contrast.ratio(0x000000, 0xFFFFFF), 1e-9);
    assertEquals(21.0, Contrast.ratio(0xFFFFFF, 0x000000), 1e-9);
    assertEquals(1.0, Contrast.ratio(0x336699, 0x336699), 1e-9);
  }

  @Test
  void luminanceIgnoresAlpha() {
    assertEquals(Contrast.luminance(0x248A3A), Contrast.luminance(0xFF248A3A), 1e-9);
  }

  @Test
  void everyAccentStaysReadableOnLightAndDarkPanels() {
    for (int accent : UiTheme.ACCENTS) {
      assertTrue(
          Contrast.ratio(accent, DARK_PANEL) >= MINIMUM,
          () -> Integer.toHexString(accent) + " on a dark panel");
      assertTrue(
          Contrast.ratio(accent, LIGHT_PANEL) >= MINIMUM,
          () -> Integer.toHexString(accent) + " on a light panel");
    }
  }

  @Test
  void vanillaTextColoursAreOpaqueAndOrdered() {
    for (int color : new int[] {UiTheme.TEXT, UiTheme.MUTED, UiTheme.DISABLED}) {
      assertEquals(0xFF, color >>> 24);
    }
    assertTrue(Contrast.luminance(UiTheme.TEXT) > Contrast.luminance(UiTheme.MUTED));
    assertTrue(Contrast.luminance(UiTheme.MUTED) > Contrast.luminance(UiTheme.DISABLED));
  }
}
