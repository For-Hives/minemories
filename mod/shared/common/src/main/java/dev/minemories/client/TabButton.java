package dev.minemories.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

/**
 * Tab header with the game's own tab look: a raised sprite and an underline for the selected tab,
 * like the tabs of the world creation screen, instead of a greyed out disabled button.
 */
final class TabButton extends FaceButton {
  private boolean selected;

  TabButton(int x, int y, int width, int height, Component label, Button.OnPress onPress) {
    super(x, y, width, height, label, onPress);
  }

  void setSelected(boolean selected) {
    this.selected = selected;
  }

  @Override
  void drawFace(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    VanillaGui.tab(graphics, getX(), getY(), width, height, selected, isHoveredOrFocused());
  }

  @Override
  void drawContent(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    Font font = Minecraft.getInstance().font;
    String text = font.plainSubstrByWidth(getMessage().getString(), width - 6);
    int textWidth = font.width(text);
    int top = getY() + (selected ? 0 : 3);
    graphics.drawString(
        font,
        text,
        getX() + (width - textWidth) / 2,
        top + (getY() + height - top - font.lineHeight) / 2 + 1,
        UiTheme.TEXT);
    if (selected) {
      int line = Math.min(textWidth, width - 4);
      int lineLeft = getX() + (width - line) / 2;
      graphics.fill(
          lineLeft, getY() + height - 2, lineLeft + line, getY() + height - 1, UiTheme.TEXT);
    }
  }
}
