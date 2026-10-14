package dev.minemories.neoforge;

import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Suggestions only: viewing this screen never selects, captures or sends a zone. */
final class SuggestedZonesScreen extends Screen {
  private final Screen parent;
  private List<VisitedZones.Zone> zones = List.of();
  private int left;
  private int top;
  private int panelWidth;

  SuggestedZonesScreen(Screen parent) {
    super(Component.literal("Zones suggérées"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    panelWidth = Math.min(390, width - 12);
    left = (width - panelWidth) / 2;
    top = Math.max(4, (height - 236) / 2);
    zones = Minemories.suggestedZones();
    addRenderableWidget(
        Button.builder(Component.literal("Retour"), ignored -> onClose())
            .bounds(left + 14, top + 202, panelWidth - 28, 20)
            .build());
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    graphics.drawString(font, title, left + 14, top + 14, 0xFFECE8DC);
    graphics.drawString(
        font, "Temps actif local · zones de 64 × 64 blocs", left + 14, top + 35, 0xFFB2B6AA);
    if (zones.isEmpty()) {
      graphics.drawString(
          font, "Joue au moins une minute dans une zone.", left + 14, top + 65, 0xFFECE8DC);
    }
    for (int i = 0; i < zones.size(); i++) {
      graphics.drawString(font, zones.get(i).label(), left + 14, top + 65 + i * 22, 0xFFECE8DC);
    }
    graphics.drawString(
        font, "Rejoins une zone puis choisis ton export.", left + 14, top + 180, 0xFFB2B6AA);
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    graphics.fill(left - 1, top - 1, left + panelWidth + 1, top + 237, 0xFF667063);
    graphics.fill(left, top, left + panelWidth, top + 236, 0xFF252926);
  }

  @Override
  public void onClose() {
    if (minecraft != null) minecraft.setScreen(parent);
  }
}
