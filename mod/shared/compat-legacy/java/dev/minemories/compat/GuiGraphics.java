package dev.minemories.compat;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiComponent;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.world.item.ItemStack;

/**
 * The slice of the 1.20 {@code GuiGraphics} the Minemories screens use, on top of the pose-stack
 * drawing of Minecraft before 1.20. Shared by every pre-1.20 target (see mod/shared/compat-legacy).
 */
public final class GuiGraphics {
  private final PoseStack pose;

  public GuiGraphics(PoseStack pose) {
    this.pose = pose;
  }

  public PoseStack pose() {
    return pose;
  }

  public void fill(int x1, int y1, int x2, int y2, int color) {
    GuiComponent.fill(pose, x1, y1, x2, y2, color);
  }

  public int drawString(Font font, String text, int x, int y, int color) {
    return font.drawShadow(pose, text, (float) x, (float) y, color);
  }

  public int drawString(Font font, String text, int x, int y, int color, boolean shadow) {
    return shadow
        ? font.drawShadow(pose, text, (float) x, (float) y, color)
        : font.draw(pose, text, (float) x, (float) y, color);
  }

  /** Tints what is drawn next (a white tint leaves textures as they are). */
  public void setColor(float red, float green, float blue, float alpha) {
    RenderSystem.setShaderColor(red, green, blue, alpha);
  }

  /** Draws a whole texture region scaled to width x height, like GuiGraphics#blit since 1.20. */
  public void blit(
      ResourceLocation texture,
      int x,
      int y,
      int width,
      int height,
      float u,
      float v,
      int regionWidth,
      int regionHeight,
      int textureWidth,
      int textureHeight) {
    RenderSystem.setShader(GameRenderer::getPositionTexShader);
    RenderSystem.setShaderTexture(0, texture);
    RenderSystem.enableBlend();
    GuiComponent.blit(
        pose, x, y, width, height, u, v, regionWidth, regionHeight, textureWidth, textureHeight);
  }

  public int drawString(Font font, Component text, int x, int y, int color) {
    return font.drawShadow(pose, text, (float) x, (float) y, color);
  }

  public int drawString(Font font, FormattedCharSequence text, int x, int y, int color) {
    return font.drawShadow(pose, text, (float) x, (float) y, color);
  }

  /** Item rendering ignores the pose stack before 1.20, so the current pose is applied to the model-view stack. */
  public void renderItem(ItemStack stack, int x, int y) {
    PoseStack modelView = RenderSystem.getModelViewStack();
    modelView.pushPose();
    modelView.mulPoseMatrix(pose.last().pose());
    RenderSystem.applyModelViewMatrix();
    Minecraft.getInstance().getItemRenderer().renderAndDecorateItem(stack, x, y);
    modelView.popPose();
    RenderSystem.applyModelViewMatrix();
  }
}
