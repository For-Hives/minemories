package dev.minemories.client;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.language.I18n;
import net.minecraft.network.chat.Component;

/** Timing and capture size of automatic memories; sliders save when the screen closes. */
final class AfkSettingsScreen extends Screen {
  private final Screen parent;
  private int idle;
  private int interval;
  private int radius;
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
    top = Math.max(4, (height - 210) / 2);
    var options = PairingClient.afkOptions();
    idle = options.idleMinutes();
    interval = options.intervalMinutes();
    radius = options.radius();
    int wide = panelWidth - 28;
    addRenderableWidget(
        new ValueSlider(
            left + 14,
            top + 34,
            wide,
            SettingSteps.IDLE_MINUTES,
            idle,
            value ->
                Component.translatable("minemories.ui.idle_slider", SettingSteps.duration(value)),
            value -> idle = value));
    addRenderableWidget(
        new ValueSlider(
            left + 14,
            top + 60,
            wide,
            SettingSteps.INTERVAL_MINUTES,
            interval,
            value ->
                Component.translatable(
                    "minemories.ui.interval_slider", SettingSteps.duration(value)),
            value -> interval = value));
    addRenderableWidget(
        new ValueSlider(
            left + 14,
            top + 86,
            wide,
            SettingSteps.RADIUS,
            radius,
            value -> Component.translatable("minemories.ui.radius_slider", value),
            value -> radius = value));
    addRenderableWidget(
        Button.builder(
                depthLabel(),
                button -> {
                  PairingClient.setFullHeightCapture(!PairingClient.isFullHeightCapture());
                  button.setMessage(depthLabel());
                })
            .bounds(left + 14, top + 118, wide, 20)
            .build());
    addRenderableWidget(
        Button.builder(Component.translatable("minemories.ui.done"), ignored -> onClose())
            .bounds(left + 14, top + 148, wide, 20)
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

  private boolean save() {
    try {
      PairingClient.configureAfk(new ClientSettings.AfkOptions(idle, interval, radius));
      return true;
    } catch (RuntimeException error) {
      status = ClientRuntime.pairingError(error);
      return false;
    }
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    UiTheme.panel(graphics, left, top, panelWidth, 210);
    graphics.drawString(
        font,
        I18n.get("minemories.ui.advanced_afk_capture_settings"),
        left + 14,
        top + 14,
        UiTheme.TEXT);
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    var lines = font.split(Component.literal(status), panelWidth - 28);
    for (int i = 0; i < Math.min(2, lines.size()); i++) {
      graphics.drawString(font, lines.get(i), left + 14, top + 176 + i * 10, UiTheme.MUTED);
    }
  }

  @Override
  public void onClose() {
    if (save() && minecraft != null) minecraft.setScreen(parent);
  }
}
