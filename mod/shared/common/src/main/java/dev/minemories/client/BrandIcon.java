package dev.minemories.client;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.resources.ResourceLocation;

/**
 * The full-colour logo without its tripod (design/logo/model/export_gui_icon.py): a 32 x 32 texture
 * drawn at 16 x 16 with smooth scaling. The tint is white to keep its colours.
 */
final class BrandIcon {
  static final int SIZE = 16;
  private static final int TEXTURE = 32;
  private static final ResourceLocation ICON =
      ResourceLocation.fromNamespaceAndPath("minemories", "textures/gui/icon.png");

  private BrandIcon() {}

  /** Draws the icon at (x, y), {@code size} pixels wide, tinted with the ARGB {@code color}. */
  static void draw(GuiGraphics graphics, int x, int y, int size, int color) {
    graphics.setColor(
        (color >> 16 & 0xFF) / 255f,
        (color >> 8 & 0xFF) / 255f,
        (color & 0xFF) / 255f,
        (color >>> 24) / 255f);
    graphics.blit(ICON, x, y, size, size, 0, 0, TEXTURE, TEXTURE, TEXTURE, TEXTURE);
    graphics.setColor(1f, 1f, 1f, 1f);
  }
}
