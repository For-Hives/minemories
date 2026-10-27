package dev.minemories.client;

import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.world.item.ItemStack;

/** Button showing a vanilla item: big puts the item above the label, compact puts it beside. */
final class IconButton extends Button {
  private static final int COLOR_LABEL = 0xFFECE8DC;
  private static final int COLOR_LABEL_OFF = 0xFF8C9086;
  private static final int COLOR_BACK = 0xFF3A3F3B;
  private static final int COLOR_BACK_HOVER = 0xFF4B5A47;
  private static final int COLOR_BACK_OFF = 0xFF2B2E2C;
  private static final int COLOR_BORDER = 0xFF667063;
  private static final int COLOR_FOCUS = 0xFFB2D8A0;
  private final ItemStack icon;
  private final boolean big;

  IconButton(
      int x,
      int y,
      int width,
      int height,
      ItemStack icon,
      Component label,
      Button.OnPress onPress,
      boolean big) {
    super(x, y, width, height, label, onPress, DEFAULT_NARRATION);
    this.icon = icon;
    this.big = big;
  }

  @Override
  public void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    int right = getX() + width;
    int bottom = getY() + height;
    graphics.fill(getX(), getY(), right, bottom, isFocused() ? COLOR_FOCUS : COLOR_BORDER);
    graphics.fill(getX() + 1, getY() + 1, right - 1, bottom - 1, background());
    Font font = Minecraft.getInstance().font;
    if (big) drawBig(graphics, font);
    else drawCompact(graphics, font);
    if (!active) graphics.fill(getX() + 1, getY() + 1, right - 1, bottom - 1, 0x88000000);
  }

  private int background() {
    if (!active) return COLOR_BACK_OFF;
    return isHoveredOrFocused() ? COLOR_BACK_HOVER : COLOR_BACK;
  }

  private void drawBig(GuiGraphics graphics, Font font) {
    int center = getX() + width / 2;
    drawScaled(graphics, icon, center - 16, getY() + 5);
    int color = active ? COLOR_LABEL : COLOR_LABEL_OFF;
    List<FormattedCharSequence> lines = font.split(getMessage(), width - 8);
    for (int i = 0; i < Math.min(2, lines.size()); i++) {
      FormattedCharSequence line = lines.get(i);
      graphics.drawString(font, line, center - font.width(line) / 2, getY() + 39 + i * 9, color);
    }
  }

  private void drawCompact(GuiGraphics graphics, Font font) {
    graphics.renderItem(icon, getX() + 4, getY() + (height - 16) / 2);
    List<FormattedCharSequence> lines = font.split(getMessage(), width - 28);
    if (lines.isEmpty()) return;
    int color = active ? COLOR_LABEL : COLOR_LABEL_OFF;
    graphics.drawString(
        font, lines.get(0), getX() + 24, getY() + (height - font.lineHeight) / 2, color);
  }

  /** Draws an item at twice its normal size, with its top-left corner at (x, y). */
  static void drawScaled(GuiGraphics graphics, ItemStack stack, int x, int y) {
    graphics.pose().pushPose();
    graphics.pose().translate(x, y, 0);
    graphics.pose().scale(2f, 2f, 1f);
    graphics.renderItem(stack, 0, 0);
    graphics.pose().popPose();
  }
}
