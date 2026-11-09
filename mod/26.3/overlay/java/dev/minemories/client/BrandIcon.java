package dev.minemories.client;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;

/**
 * The full-colour logo without its tripod (design/logo/model/export_gui_icon.py): a 32 x 32 texture
 * drawn at 16 x 16 with smooth scaling. The tint is white to keep its colours.
 */
final class BrandIcon {
  static final int SIZE = 16;
  private static final int TEXTURE = 32;
  private static final Identifier ICON =
      Identifier.fromNamespaceAndPath("minemories", "textures/gui/icon.png");

  private BrandIcon() {}

  /** Draws the icon at (x, y), {@code size} pixels wide, tinted with the ARGB {@code color}. */
  static void draw(GuiGraphicsExtractor graphics, int x, int y, int size, int color) {
    graphics.blit(
        RenderPipelines.GUI_TEXTURED,
        ICON,
        x,
        y,
        0f,
        0f,
        size,
        size,
        TEXTURE,
        TEXTURE,
        TEXTURE,
        TEXTURE,
        color);
  }
}
