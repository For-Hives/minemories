package dev.minemories.client;

import com.mojang.blaze3d.systems.RenderSystem;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.resources.ResourceLocation;

/**
 * The game's own panel, separator and tab drawing (Minecraft 1.20.2 to 1.21.5 form, the one the
 * shared sources are written against). Every texture and sprite is Minecraft's, so resource packs
 * and UI mods replace them. Each Minecraft version family has its own copy of this class: see
 * mod/1.21.11/overlay, mod/26.3/overlay and mod/shared/compat-legacy/gui.
 */
final class VanillaGui {
  private static final ResourceLocation LIST_BACKGROUND =
      ResourceLocation.withDefaultNamespace("textures/gui/menu_list_background.png");
  private static final ResourceLocation INWORLD_LIST_BACKGROUND =
      ResourceLocation.withDefaultNamespace("textures/gui/inworld_menu_list_background.png");
  private static final ResourceLocation TAB_SELECTED =
      ResourceLocation.withDefaultNamespace("widget/tab_selected");
  private static final ResourceLocation TAB = ResourceLocation.withDefaultNamespace("widget/tab");
  private static final ResourceLocation TAB_SELECTED_HIGHLIGHTED =
      ResourceLocation.withDefaultNamespace("widget/tab_selected_highlighted");
  private static final ResourceLocation TAB_HIGHLIGHTED =
      ResourceLocation.withDefaultNamespace("widget/tab_highlighted");

  private VanillaGui() {}

  private static boolean inWorld() {
    return Minecraft.getInstance().level != null;
  }

  /** What a vanilla list draws: the tiled list background with a separator above and below. */
  static void panel(GuiGraphics graphics, int left, int top, int width, int height) {
    RenderSystem.enableBlend();
    graphics.blit(
        inWorld() ? INWORLD_LIST_BACKGROUND : LIST_BACKGROUND,
        left,
        top,
        (float) left,
        (float) top,
        width,
        height,
        32,
        32);
    RenderSystem.disableBlend();
    separator(graphics, left, top - 2, width, true);
    separator(graphics, left, top + height, width, false);
  }

  /**
   * A two pixel separator whose top edge is at y: the header one sits above a list, the footer one
   * below.
   */
  static void separator(GuiGraphics graphics, int left, int y, int width, boolean header) {
    ResourceLocation texture =
        inWorld()
            ? (header ? Screen.INWORLD_HEADER_SEPARATOR : Screen.INWORLD_FOOTER_SEPARATOR)
            : (header ? Screen.HEADER_SEPARATOR : Screen.FOOTER_SEPARATOR);
    RenderSystem.enableBlend();
    graphics.blit(texture, left, y, 0f, 0f, width, 2, 32, 2);
    RenderSystem.disableBlend();
  }

  /** The vanilla tab sprite: raised for a selected tab, lighter when hovered or focused. */
  static void tab(
      GuiGraphics graphics,
      int x,
      int y,
      int width,
      int height,
      boolean selected,
      boolean highlighted) {
    ResourceLocation sprite =
        selected
            ? (highlighted ? TAB_SELECTED_HIGHLIGHTED : TAB_SELECTED)
            : (highlighted ? TAB_HIGHLIGHTED : TAB);
    RenderSystem.enableBlend();
    graphics.blitSprite(sprite, x, y, width, height);
    RenderSystem.disableBlend();
  }
}
