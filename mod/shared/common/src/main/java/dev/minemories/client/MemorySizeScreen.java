package dev.minemories.client;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.language.I18n;
import net.minecraft.network.chat.Component;

/** How big a manual memory is: around the player, plus how far up and down it reaches. */
final class MemorySizeScreen extends Screen {
  private final Screen parent;
  private int radius;
  private int up;
  private int down;
  private String status = "";
  private int left;
  private int top;
  private int panelWidth;

  MemorySizeScreen(Screen parent) {
    super(Component.translatable("minemories.ui.memory_size"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    panelWidth = Math.min(390, width - 12);
    left = (width - panelWidth) / 2;
    top = Math.max(4, (height - 184) / 2);
    var size = PairingClient.manualSize();
    radius = size.radius();
    up = size.up();
    down = size.down();
    int wide = panelWidth - 28;
    addRenderableWidget(
        new ValueSlider(
            left + 14,
            top + 38,
            wide,
            SettingSteps.RADIUS,
            radius,
            value -> Component.translatable("minemories.ui.radius_slider", value),
            value -> radius = value));
    addRenderableWidget(
        new ValueSlider(
            left + 14,
            top + 64,
            wide,
            SettingSteps.VERTICAL,
            up,
            value -> vertical("minemories.ui.height_slider", value),
            value -> up = value));
    addRenderableWidget(
        new ValueSlider(
            left + 14,
            top + 90,
            wide,
            SettingSteps.VERTICAL,
            down,
            value -> vertical("minemories.ui.depth_slider", value),
            value -> down = value));
    addRenderableWidget(
        Button.builder(Component.translatable("minemories.ui.done"), ignored -> onClose())
            .bounds(left + 14, top + 122, wide, 20)
            .build());
  }

  private static Component vertical(String key, int blocks) {
    return Component.translatable(
        key, blocks == 0 ? I18n.get("minemories.ui.automatic") : Integer.toString(blocks));
  }

  private boolean save() {
    try {
      PairingClient.configureManualSize(new ClientSettings.ManualSize(radius, up, down));
      return true;
    } catch (RuntimeException error) {
      status = ClientRuntime.pairingError(error);
      return false;
    }
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    UiTheme.panel(graphics, left, top, panelWidth, 184);
    graphics.drawString(font, title, left + 14, top + 14, UiTheme.TEXT);
    graphics.drawString(
        font, I18n.get("minemories.ui.memory_size_hint"), left + 14, top + 26, UiTheme.MUTED);
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    String summary =
        status.isEmpty()
            ? I18n.get("minemories.ui.memory_size_summary", radius * 2 + 1, radius * 2 + 1)
            : status;
    graphics.drawString(font, summary, left + 14, top + 150, UiTheme.MUTED);
  }

  @Override
  public void onClose() {
    if (save() && minecraft != null) minecraft.setScreen(parent);
  }
}
