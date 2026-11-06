package dev.minemories.compat;

import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiComponent;
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
