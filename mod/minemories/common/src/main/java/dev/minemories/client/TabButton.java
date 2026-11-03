package dev.minemories.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

/**
 * Tab header: the selected tab is filled and underlined instead of greyed out like a disabled
 * button.
 */
final class TabButton extends Button {
  private static final int BACK = 0xFF3A3F3B;
  private static final int BACK_HOVER = 0xFF4B5A47;
  private static final int BACK_SELECTED = 0xFF30352F;
  private boolean selected;

  TabButton(int x, int y, int width, int height, Component label, Button.OnPress onPress) {
    super(x, y, width, height, label, onPress, DEFAULT_NARRATION);
  }

  void setSelected(boolean selected) {
    this.selected = selected;
  }

  @Override
  public void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    int right = getX() + width;
    int bottom = getY() + height;
    int back = selected ? BACK_SELECTED : isHoveredOrFocused() ? BACK_HOVER : BACK;
    graphics.fill(getX(), getY(), right, bottom, back);
    if (selected) graphics.fill(getX(), bottom - 3, right, bottom, UiTheme.OK);
    else if (isFocused()) graphics.fill(getX(), bottom - 1, right, bottom, UiTheme.TEXT);
    Font font = Minecraft.getInstance().font;
    String text = font.plainSubstrByWidth(getMessage().getString(), width - 6);
    graphics.drawString(
        font,
        text,
        getX() + (width - font.width(text)) / 2,
        getY() + (height - 3 - font.lineHeight) / 2 + 1,
        selected ? UiTheme.TEXT : UiTheme.MUTED);
  }
}
