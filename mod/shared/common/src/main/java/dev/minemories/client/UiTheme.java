package dev.minemories.client;

import net.minecraft.client.gui.GuiGraphics;

/**
 * What the Minemories screens take from the game's own look. Backgrounds, panels, separators and
 * button faces are drawn by Minecraft's own textures and sprites ({@link VanillaGui}, {@link
 * FaceButton}), so a resource pack or a UI mod that restyles them restyles these screens too. Text
 * uses the colours vanilla uses for its widgets and labels; only the accents that carry a meaning
 * (done, warning, error, server) stay fixed, picked to be readable on a light and on a dark panel
 * ({@code UiThemeTest}).
 */
final class UiTheme {
  /** Vanilla label and active widget text. */
  static final int TEXT = 0xFFFFFFFF;

  /** Vanilla drop shadow of white text (a quarter of its brightness). */
  static final int TEXT_SHADOW = 0xFF3F3F3F;

  /** Vanilla secondary text ({@code ChatFormatting.GRAY}). */
  static final int MUTED = 0xFFAAAAAA;

  /** Vanilla text of a disabled widget. */
  static final int DISABLED = 0xFFA0A0A0;

  /** Done, connected, sent. */
  static final int OK = 0xFF248A3A;

  /** Needs attention: not connected, storage almost full. */
  static final int WARN = 0xFFB06A00;

  /** Failed or unreadable. */
  static final int ERROR = 0xFFD64034;

  /** Neutral information that tells two kinds of item apart (a server versus a local world). */
  static final int INFO = 0xFF3273D2;

  /** Neutral shading of a progress bar track: darkens whatever the panel looks like. */
  static final int TRACK = 0x99000000;

  /**
   * The heat map is a chart, not chrome: a plain dark frame and empty cell keep its ramp readable.
   */
  static final int CHART_FRAME = 0xFF000000;

  static final int CHART_EMPTY = 0xFF2A2A2A;

  /** The accents, so the contrast test covers every one of them. */
  static final int[] ACCENTS = {OK, WARN, ERROR, INFO};

  private UiTheme() {}

  /** The panel every screen sits on: the game's list background between two separators. */
  static void panel(GuiGraphics graphics, int left, int top, int width, int height) {
    VanillaGui.panel(graphics, left, top, width, height);
  }

  /** A separator line above a group of content, like the one above a vanilla list. */
  static void separatorAbove(GuiGraphics graphics, int left, int y, int width) {
    VanillaGui.separator(graphics, left, y - 2, width, true);
  }

  /** A separator line below a group of content, like the one below a vanilla list. */
  static void separatorBelow(GuiGraphics graphics, int left, int y, int width) {
    VanillaGui.separator(graphics, left, y, width, false);
  }
}
