package dev.minemories.client;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

/** A small square button showing only the monochrome Minemories icon. */
final class BrandButton extends Button {
  static final int SIZE = 20;

  BrandButton(int x, int y, Component label, Button.OnPress onPress) {
    super(x, y, SIZE, SIZE, label, onPress, DEFAULT_NARRATION);
  }

  @Override
  public void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    MenuButtonLook.frame(
        graphics, getX(), getY(), width, height, isHoveredOrFocused(), isFocused());
    BrandIcon.draw(graphics, getX() + 2, getY() + 2, BrandIcon.SIZE, 0xFFFFFFFF);
  }
}
