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
  private String status = I18n.get("minemories.ui.active_while_paused_and_in_background");
  private int left;
  private int top;
  private int panelWidth;

  AfkSettingsScreen(Screen parent) {
    super(Component.translatable("minemories.ui.afk_settings"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    panelWidth = Math.min(390, width - 12);
    left = (width - panelWidth) / 2;
    top = Math.max(4, (height - 230) / 2);
    var options = PairingClient.afkOptions();
    idle = field(I18n.get("minemories.ui.idle_minutes"), 44, options.idleMinutes());
    interval =
        field(I18n.get("minemories.ui.capture_interval_minutes"), 87, options.intervalMinutes());
    radius = field(I18n.get("minemories.ui.player_radius_blocks"), 130, options.radius());
    addRenderableWidget(
        Button.builder(Component.translatable("minemories.ui.save"), ignored -> save())
            .bounds(left + 14, top + 160, (panelWidth - 34) / 2, 20)
            .build());
    addRenderableWidget(
        Button.builder(Component.translatable("minemories.ui.back"), ignored -> onClose())
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
                ? "minemories.ui.full_dimension"
                : "minemories.ui.visited_areas"));
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
      status = I18n.get("minemories.ui.settings_saved_smaller_is_lighter");
    } catch (NumberFormatException error) {
      status = I18n.get("minemories.ui.fill_three_fields_whole_numbers");
    } catch (RuntimeException error) {
      status = ClientRuntime.pairingError(error);
    }
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    UiTheme.panel(graphics, left, top, panelWidth, 230);
    graphics.drawString(
        font,
        I18n.get("minemories.ui.advanced_afk_capture_settings"),
        left + 14,
        top + 12,
        UiTheme.TEXT);
    graphics.drawString(
        font,
        I18n.get("minemories.ui.idle_before_capture_range"),
        left + 14,
        top + 31,
        UiTheme.TEXT);
    graphics.drawString(
        font, I18n.get("minemories.ui.capture_interval_range"), left + 14, top + 74, UiTheme.TEXT);
    graphics.drawString(
        font, I18n.get("minemories.ui.player_radius_range"), left + 14, top + 117, UiTheme.TEXT);
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    var lines = font.split(Component.literal(status), panelWidth - 28);
    for (int i = 0; i < Math.min(2, lines.size()); i++) {
      graphics.drawString(font, lines.get(i), left + 14, top + 208 + i * 10, UiTheme.TEXT);
    }
  }

  @Override
  public void onClose() {
    if (minecraft != null) minecraft.setScreen(parent);
  }
}
