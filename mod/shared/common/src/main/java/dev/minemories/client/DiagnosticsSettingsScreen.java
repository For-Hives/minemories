package dev.minemories.client;

import java.util.List;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.language.I18n;
import net.minecraft.network.chat.Component;

/** Optional diagnostics are explained before the player explicitly enables them. */
final class DiagnosticsSettingsScreen extends Screen {
  private final Screen parent;
  private Button toggle;
  private String status = "";
  private String saveError;
  private boolean enabled;
  private int left;
  private int top;
  private int panelWidth;

  DiagnosticsSettingsScreen(Screen parent) {
    super(Component.translatable("minemories.ui.technical_diagnostics"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    panelWidth = Math.min(390, width - 12);
    left = (width - panelWidth) / 2;
    top = Math.max(2, (height - 236) / 2);
    int half = (panelWidth - 34) / 2;
    toggle =
        addRenderableWidget(
            Button.builder(
                    Component.translatable("minemories.ui.diagnostics_off"),
                    ignored -> changeConsent())
                .bounds(left + 14, top + 204, half, 20)
                .build());
    addRenderableWidget(
        Button.builder(Component.translatable("minemories.ui.back"), ignored -> onClose())
            .bounds(left + 20 + half, top + 204, half, 20)
            .build());
    refresh();
  }

  private void refresh() {
    try {
      enabled = PairingClient.diagnosticsConsent();
      toggle.active = enabled || PairingClient.isPaired();
      toggle.setMessage(
          Component.translatable(
              enabled
                  ? "minemories.options.diagnostics.enabled"
                  : "minemories.ui.diagnostics_off"));
      status = saveError != null ? saveError : PairingClient.diagnosticsStatus();
    } catch (RuntimeException ignored) {
      toggle.active = false;
      status = I18n.get("minemories.ui.unreadable_settings_no_collection");
    }
  }

  private void changeConsent() {
    try {
      PairingClient.setDiagnosticsConsent(!enabled);
      saveError = null;
      refresh();
    } catch (RuntimeException ignored) {
      saveError =
          enabled
              ? I18n.get("minemories.ui.withdrawal_not_saved_fix_permissions")
              : I18n.get("minemories.ui.setting_not_saved_retry");
      refresh();
    }
  }

  @Override
  public void tick() {
    super.tick();
    refresh();
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    graphics.fill(left - 1, top - 1, left + panelWidth + 1, top + 237, 0xFF667063);
    graphics.fill(left, top, left + panelWidth, top + 236, 0xFF252926);
    graphics.drawString(font, title, left + 14, top + 14, 0xFFECE8DC);
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    int y = top + 34;
    for (String paragraph :
        List.of(
            I18n.get("minemories.ui.diagnostics_intro"),
            I18n.get("minemories.ui.diagnostics_contents"),
            I18n.get("minemories.ui.diagnostics_exclusions"),
            I18n.get("minemories.ui.diagnostics_off_effect"))) {
      var lines = font.split(Component.literal(paragraph), panelWidth - 28);
      for (var line : lines) {
        if (y < top + 178) graphics.drawString(font, line, left + 14, y, 0xFFECE8DC);
        y += 10;
      }
      y += 5;
    }
    var statusLines = font.split(Component.literal(status), panelWidth - 28);
    for (int index = 0; index < Math.min(2, statusLines.size()); index++) {
      graphics.drawString(
          font, statusLines.get(index), left + 14, top + 182 + index * 10, 0xFFB2B6AA);
    }
  }

  @Override
  public void onClose() {
    if (minecraft != null) minecraft.setScreen(parent);
  }
}
