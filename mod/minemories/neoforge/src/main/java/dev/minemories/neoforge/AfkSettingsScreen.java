package dev.minemories.neoforge;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Timing and capture size stay out of the simple interface. */
final class AfkSettingsScreen extends Screen {
  private final Screen parent;
  private EditBox idle;
  private EditBox interval;
  private EditBox radius;
  private String status = "Actif aussi en pause et en arrière-plan.";
  private int left;
  private int top;
  private int panelWidth;

  AfkSettingsScreen(Screen parent) {
    super(Component.literal("Réglages AFK"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    panelWidth = Math.min(390, width - 12);
    left = (width - panelWidth) / 2;
    top = Math.max(4, (height - 230) / 2);
    var options = PairingClient.afkOptions();
    idle = field("Inactivité avant capture (minutes)", 44, options.idleMinutes());
    interval = field("Intervalle entre captures (minutes)", 87, options.intervalMinutes());
    radius = field("Rayon autour du joueur (blocs)", 130, options.radius());
    addRenderableWidget(
        Button.builder(Component.literal("Enregistrer"), ignored -> save())
            .bounds(left + 14, top + 160, (panelWidth - 34) / 2, 20)
            .build());
    addRenderableWidget(
        Button.builder(Component.literal("Retour"), ignored -> onClose())
            .bounds(left + 20 + (panelWidth - 34) / 2, top + 160, (panelWidth - 34) / 2, 20)
            .build());
  }

  private EditBox field(String label, int y, int value) {
    EditBox field =
        addRenderableWidget(
            new EditBox(font, left + 14, top + y, panelWidth - 28, 20, Component.literal(label)));
    field.setMaxLength(5);
    field.setFilter(text -> text.matches("\\d{0,5}"));
    field.setValue(Integer.toString(value));
    return field;
  }

  private void save() {
    try {
      PairingClient.configureAfk(
          new ClientSettings.AfkOptions(
              Integer.parseInt(idle.getValue()),
              Integer.parseInt(interval.getValue()),
              Integer.parseInt(radius.getValue())));
      status = "Réglages enregistrés. Plus petit = capture plus légère.";
    } catch (NumberFormatException error) {
      status = "Remplis les trois champs avec des nombres entiers.";
    } catch (RuntimeException error) {
      status = Minemories.pairingError(error);
    }
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    graphics.fill(left, top, left + panelWidth, top + 230, 0xFF182019);
    graphics.drawString(font, "Réglages avancés : captures AFK", left + 14, top + 12, 0xFFE3E9DD);
    graphics.drawString(
        font, "Inactivité avant capture (1–1440 min)", left + 14, top + 31, 0xFFE3E9DD);
    graphics.drawString(
        font, "Intervalle entre captures (1–10080 min)", left + 14, top + 74, 0xFFE3E9DD);
    graphics.drawString(
        font, "Rayon autour du joueur (2–128 blocs)", left + 14, top + 117, 0xFFE3E9DD);
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    var lines = font.split(Component.literal(status), panelWidth - 28);
    for (int i = 0; i < Math.min(4, lines.size()); i++) {
      graphics.drawString(font, lines.get(i), left + 14, top + 188 + i * 10, 0xFFE3E9DD);
    }
  }

  @Override
  public void onClose() {
    if (minecraft != null) minecraft.setScreen(parent);
  }
}
