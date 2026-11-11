package dev.minemories.client;

import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.world.item.ItemStack;

/**
 * Button showing a vanilla item on the game's own button face: big puts the item above the label,
 * compact puts it beside.
 */
final class IconButton extends FaceButton {
  private final ItemStack icon;
  private final boolean big;
  private boolean status;

  IconButton(
      int x,
      int y,
      int width,
      int height,
      ItemStack icon,
      Component label,
      Button.OnPress onPress,
      boolean big) {
    super(x, y, width, height, label, onPress);
    this.icon = icon;
    this.big = big;
  }

  /** Marks a toggle as on with an accent bar along its top edge. */
  void setStatus(boolean on) {
    status = on;
  }

  @Override
  void drawContent(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    Font font = Minecraft.getInstance().font;
    if (big) drawBig(graphics, font);
    else drawCompact(graphics, font);
    if (status) {
      graphics.fill(getX() + 1, getY() + 1, getX() + width - 1, getY() + 4, UiTheme.OK);
    }
  }

  private void drawBig(GuiGraphics graphics, Font font) {
    int center = getX() + width / 2;
    drawScaled(graphics, icon, center - 16, getY() + 5);
    int color = active ? UiTheme.TEXT : UiTheme.DISABLED;
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
    int color = active ? UiTheme.TEXT : UiTheme.DISABLED;
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
