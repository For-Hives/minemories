package dev.minemories.client;

import net.minecraft.client.gui.GuiGraphics;

/** Shared palette and panel drawing so every Minemories screen reads the same. */
final class UiTheme {
  static final int PANEL = 0xFF252926;
  static final int BORDER = 0xFF667063;
  static final int CARD = 0xFF30352F;
  static final int TEXT = 0xFFECE8DC;
  static final int MUTED = 0xFFB2B6AA;
  static final int OK = 0xFF8FD694;
  static final int WARN = 0xFFE8B84A;
  static final int ACCENT = 0xFF5E8F55;

  private UiTheme() {}

  static void panel(GuiGraphics graphics, int left, int top, int width, int height) {
    graphics.fill(left - 1, top - 1, left + width + 1, top + height + 1, BORDER);
    graphics.fill(left, top, left + width, top + height, PANEL);
  }
}
