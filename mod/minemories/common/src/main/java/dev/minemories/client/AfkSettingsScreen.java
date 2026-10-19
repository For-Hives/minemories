package dev.minemories.client;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.language.I18n;
import net.minecraft.network.chat.Component;

/** Timing and capture size stay out of the simple interface. */
final class AfkSettingsScreen extends Screen {
  private final Screen parent;
  private EditBox idle;
  private EditBox interval;
  private EditBox radius;
  private String status = I18n.get("minemories.ui.actif_aussi_en_pause_et_en_arriere_plan");
  private int left;
  private int top;
  private int panelWidth;

  AfkSettingsScreen(Screen parent) {
    super(Component.translatable("minemories.ui.reglages_afk"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    panelWidth = Math.min(390, width - 12);
    left = (width - panelWidth) / 2;
    top = Math.max(4, (height - 230) / 2);
    var options = PairingClient.afkOptions();
    idle =
        field(
            I18n.get("minemories.ui.inactivite_avant_capture_minutes"), 44, options.idleMinutes());
    interval =
        field(
            I18n.get("minemories.ui.intervalle_entre_captures_minutes"),
            87,
            options.intervalMinutes());
    radius = field(I18n.get("minemories.ui.rayon_autour_du_joueur_blocs"), 130, options.radius());
    addRenderableWidget(
        Button.builder(Component.translatable("minemories.ui.enregistrer"), ignored -> save())
            .bounds(left + 14, top + 160, (panelWidth - 34) / 2, 20)
            .build());
    addRenderableWidget(
        Button.builder(Component.translatable("minemories.ui.retour"), ignored -> onClose())
            .bounds(left + 20 + (panelWidth - 34) / 2, top + 160, (panelWidth - 34) / 2, 20)
            .build());
    addRenderableWidget(
        Button.builder(
                depthLabel(),
                button -> {
                  PairingClient.setFullHeightCapture(!PairingClient.isFullHeightCapture());
                  button.setMessage(depthLabel());
                })
            .bounds(left + 14, top + 184, panelWidth - 28, 20)
            .build());
  }

  private Component depthLabel() {
    return Component.translatable(
        "minemories.options.depth",
        Component.translatable(
            PairingClient.isFullHeightCapture()
                ? "minemories.ui.toute_la_dimension"
                : "minemories.ui.zones_visitees"));
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
      status = I18n.get("minemories.ui.reglages_enregistres_plus_petit_capture_plus_legere");
    } catch (NumberFormatException error) {
      status = I18n.get("minemories.ui.remplis_les_trois_champs_avec_des_nombres_entiers");
    } catch (RuntimeException error) {
      status = ClientRuntime.pairingError(error);
    }
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    graphics.fill(left, top, left + panelWidth, top + 230, 0xFF182019);
    graphics.drawString(
        font,
        I18n.get("minemories.ui.reglages_avances_captures_afk"),
        left + 14,
        top + 12,
        0xFFE3E9DD);
    graphics.drawString(
        font,
        I18n.get("minemories.ui.inactivite_avant_capture_11440_min"),
        left + 14,
        top + 31,
        0xFFE3E9DD);
    graphics.drawString(
        font,
        I18n.get("minemories.ui.intervalle_entre_captures_110080_min"),
        left + 14,
        top + 74,
        0xFFE3E9DD);
    graphics.drawString(
        font,
        I18n.get("minemories.ui.rayon_autour_du_joueur_2128_blocs"),
        left + 14,
        top + 117,
        0xFFE3E9DD);
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    var lines = font.split(Component.literal(status), panelWidth - 28);
    for (int i = 0; i < Math.min(2, lines.size()); i++) {
      graphics.drawString(font, lines.get(i), left + 14, top + 208 + i * 10, 0xFFE3E9DD);
    }
  }

  @Override
  public void onClose() {
    if (minecraft != null) minecraft.setScreen(parent);
  }
}
