package dev.minemories.client;

import net.minecraft.client.gui.GuiGraphics;

/** Draws a small button like a vanilla one, so it never looks disabled next to Minecraft's own. */
final class MenuButtonLook {
  private MenuButtonLook() {}

  static void frame(
      GuiGraphics graphics, int x, int y, int width, int height, boolean hovered, boolean focused) {
    int right = x + width;
    int bottom = y + height;
    graphics.fill(x, y, right, bottom, focused ? 0xFFFFFFFF : 0xFF000000);
    graphics.fill(x + 1, y + 1, right - 1, bottom - 1, hovered ? 0xFF8A8AA8 : 0xFF6E6E6E);
    graphics.fill(x + 1, y + 1, right - 1, y + 2, hovered ? 0xFFB8B8D8 : 0xFFA0A0A0);
    graphics.fill(x + 1, y + 1, x + 2, bottom - 1, hovered ? 0xFFB8B8D8 : 0xFFA0A0A0);
    graphics.fill(x + 1, bottom - 2, right - 1, bottom - 1, hovered ? 0xFF55557A : 0xFF3C3C3C);
    graphics.fill(right - 2, y + 1, right - 1, bottom - 1, hovered ? 0xFF55557A : 0xFF3C3C3C);
  }
}
