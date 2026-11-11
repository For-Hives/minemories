package dev.minemories.client;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

/** A small square button showing only the Minemories icon on the game's own button face. */
final class BrandButton extends FaceButton {
  static final int SIZE = 20;

  BrandButton(int x, int y, Component label, Button.OnPress onPress) {
    super(x, y, SIZE, SIZE, label, onPress);
  }

  @Override
  void drawContent(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    BrandIcon.draw(graphics, getX() + 2, getY() + 2, BrandIcon.SIZE, 0xFFFFFFFF);
  }
}
