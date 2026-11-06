package dev.minemories.compat;

import com.mojang.blaze3d.vertex.PoseStack;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Widget tooltips before 1.19.3: remembered per widget, drawn by the screen's render. */
public final class Tooltips {
  private static final Map<AbstractWidget, Tooltip> TIPS = new WeakHashMap<>();

  private Tooltips() {}

  public static void set(AbstractWidget widget, Tooltip tooltip) {
    TIPS.put(widget, tooltip);
  }

  /** Draws the tooltip of the hovered widget, if any. */
  public static void render(PoseStack pose, Screen screen, int mouseX, int mouseY) {
    for (GuiEventListener child : screen.children()) {
      if (!(child instanceof AbstractWidget widget) || !widget.visible) continue;
      Tooltip tip = TIPS.get(widget);
      if (tip == null || !widget.isMouseOver(mouseX, mouseY)) continue;
      List<Component> lines = new ArrayList<>();
      for (String line : tip.text.getString().split("\n")) lines.add(Component.nullToEmpty(line));
      screen.renderComponentTooltip(pose, lines, mouseX, mouseY);
      return;
    }
  }
}
