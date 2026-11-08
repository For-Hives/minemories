package dev.minemories.client;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

/** A small square button with a gear: it opens the options of the action next to it. */
final class GearButton extends Button {
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
    super(x, y, size, size, label, onPress, DEFAULT_NARRATION);
  }

  @Override
  public void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    MenuButtonLook.frame(
        graphics, getX(), getY(), width, height, isHoveredOrFocused(), isFocused());
    int originX = getX() + (width - GEAR[0].length()) / 2;
    int originY = getY() + (height - GEAR.length) / 2;
    for (int row = 0; row < GEAR.length; row++) {
      for (int column = 0; column < GEAR[row].length(); column++) {
        if (GEAR[row].charAt(column) == '#') {
          graphics.fill(
              originX + column, originY + row, originX + column + 1, originY + row + 1, 0xFFFFFFFF);
        }
      }
    }
  }
}
