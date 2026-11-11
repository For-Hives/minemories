package dev.minemories.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.resources.Identifier;

/**
 * The game's own panel, separator and tab drawing (Minecraft 26.3: render pipelines and GuiGraphicsExtractor).
 * Every texture and sprite is Minecraft's, so resource packs and UI mods replace them. See the
 * shared class of the same name for the 1.21.1 form this is ported from.
 */
final class VanillaGui {
  private static final Identifier LIST_BACKGROUND =
      Identifier.withDefaultNamespace("textures/gui/menu_list_background.png");
  private static final Identifier INWORLD_LIST_BACKGROUND =
      Identifier.withDefaultNamespace("textures/gui/inworld_menu_list_background.png");
  private static final Identifier TAB_SELECTED =
      Identifier.withDefaultNamespace("widget/tab_selected");
  private static final Identifier TAB = Identifier.withDefaultNamespace("widget/tab");
  private static final Identifier TAB_SELECTED_HIGHLIGHTED =
      Identifier.withDefaultNamespace("widget/tab_selected_highlighted");
  private static final Identifier TAB_HIGHLIGHTED =
      Identifier.withDefaultNamespace("widget/tab_highlighted");

  private VanillaGui() {}

  private static boolean inWorld() {
    return Minecraft.getInstance().level != null;
  }

  /** What a vanilla list draws: the tiled list background with a separator above and below. */
  static void panel(GuiGraphicsExtractor graphics, int left, int top, int width, int height) {
    graphics.blit(
        RenderPipelines.GUI_TEXTURED,
        inWorld() ? INWORLD_LIST_BACKGROUND : LIST_BACKGROUND,
        left,
        top,
        (float) left,
        (float) top,
        width,
        height,
        32,
        32);
    separator(graphics, left, top - 2, width, true);
    separator(graphics, left, top + height, width, false);
  }

  /** A two pixel separator whose top edge is at y: the header one sits above a list, the footer one below. */
  static void separator(GuiGraphicsExtractor graphics, int left, int y, int width, boolean header) {
    Identifier texture =
        inWorld()
            ? (header ? Screen.INWORLD_HEADER_SEPARATOR : Screen.INWORLD_FOOTER_SEPARATOR)
            : (header ? Screen.HEADER_SEPARATOR : Screen.FOOTER_SEPARATOR);
    graphics.blit(RenderPipelines.GUI_TEXTURED, texture, left, y, 0f, 0f, width, 2, 32, 2);
  }

  /** The vanilla tab sprite: raised for a selected tab, lighter when hovered or focused. */
  static void tab(
      GuiGraphicsExtractor graphics,
      int x,
      int y,
      int width,
      int height,
      boolean selected,
      boolean highlighted) {
    Identifier sprite =
        selected
            ? (highlighted ? TAB_SELECTED_HIGHLIGHTED : TAB_SELECTED)
            : (highlighted ? TAB_HIGHLIGHTED : TAB);
    graphics.blitSprite(RenderPipelines.GUI_TEXTURED, sprite, x, y, width, height);
  }
}
