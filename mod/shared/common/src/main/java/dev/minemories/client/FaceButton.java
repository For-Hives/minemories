package dev.minemories.client;

import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.network.chat.Component;

/**
 * A button whose face is the game's own button (so a resource pack or a UI mod that restyles
 * buttons restyles it), with a custom content drawn on top instead of the centred label.
 */
abstract class FaceButton extends Button {
  FaceButton(int x, int y, int width, int height, Component label, Button.OnPress onPress) {
    super(x, y, width, height, label, onPress, DEFAULT_NARRATION);
  }

  /** Draws the icon, label or glyph that sits on the face. */
  abstract void drawContent(GuiGraphics graphics, int mouseX, int mouseY, float partialTick);

  /** Draws the face: the vanilla button (disabled, normal or highlighted) without its label. */
  void drawFace(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderWidget(graphics, mouseX, mouseY, partialTick);
  }

  @Override
  public void renderWidget(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    drawFace(graphics, mouseX, mouseY, partialTick);
    drawContent(graphics, mouseX, mouseY, partialTick);
  }

  /** The vanilla centred label is replaced by {@link #drawContent}. */
  @Override
  public void renderString(GuiGraphics graphics, Font font, int color) {}
}
