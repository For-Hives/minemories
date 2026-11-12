package dev.minemories.client;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

/** A small square button with a gear: it opens the options of the action next to it. */
final class GearButton extends FaceButton {
  private static final String[] GEAR = {
    "....###....",
    ".#.#####.#.",
    "..#######..",
    ".####.####.",
    "####...####",
    "####...####",
    "####...####",
    ".####.####.",
    "..#######..",
    ".#.#####.#.",
    "....###....",
  };

  GearButton(int x, int y, int size, Component label, Button.OnPress onPress) {
    super(x, y, size, size, label, onPress);
  }

  @Override
  void drawContent(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    int originX = getX() + (width - GEAR[0].length()) / 2;
    int originY = getY() + (height - GEAR.length) / 2;
    // The vanilla text shadow first, so the white gear stays readable on a light button face.
    drawGear(graphics, originX + 1, originY + 1, UiTheme.TEXT_SHADOW);
    drawGear(graphics, originX, originY, UiTheme.TEXT);
  }

  private static void drawGear(GuiGraphics graphics, int originX, int originY, int color) {
    for (int row = 0; row < GEAR.length; row++) {
      for (int column = 0; column < GEAR[row].length(); column++) {
        if (GEAR[row].charAt(column) == '#') {
          graphics.fill(
              originX + column, originY + row, originX + column + 1, originY + row + 1, color);
        }
      }
    }
  }
}
