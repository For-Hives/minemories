package dev.minemories.neoforge;

import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

final class StorageQuotaScreen extends Screen {
  private final Screen parent;
  private final StorageStatusView storage = new StorageStatusView();
  private boolean paired;
  private int panelWidth;
  private int left;
  private int top;

  StorageQuotaScreen(Screen parent) {
    super(Component.literal("Stockage de la galerie"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    panelWidth = Math.min(390, width - 12);
    left = (width - panelWidth) / 2;
    top = Math.max(4, (height - 204) / 2);
    try {
      paired = PairingClient.isPaired();
    } catch (RuntimeException error) {
      paired = false;
    }
    storage.reset(paired);
    int half = (panelWidth - 34) / 2;
    Button refresh =
        addRenderableWidget(
            Button.builder(Component.literal("Actualiser"), ignored -> storage.reset(paired))
                .bounds(left + 14, top + 176, half, 20)
                .build());
    refresh.active = paired;
    addRenderableWidget(
        Button.builder(Component.literal("Retour"), ignored -> onClose())
            .bounds(left + 20 + half, top + 176, half, 20)
            .build());
  }

  @Override
  public void tick() {
    super.tick();
    storage.update(
        System.currentTimeMillis(),
        paired,
        PairingClient::storageStatus,
        Minecraft.getInstance()::execute);
  }

  @Override
  public void removed() {
    storage.reset(false);
    super.removed();
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    graphics.fill(left - 1, top - 1, left + panelWidth + 1, top + 205, 0xFF667063);
    graphics.fill(left, top, left + panelWidth, top + 204, 0xFF252926);
    graphics.drawString(font, title, left + 14, top + 14, 0xFFECE8DC);
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    StorageQuota quota = storage.quota();
    if (quota == null) {
      var lines = font.split(Component.literal(storage.label()), panelWidth - 28);
      for (int i = 0; i < Math.min(4, lines.size()); i++) {
        graphics.drawString(font, lines.get(i), left + 14, top + 34 + i * 13, 0xFFECE8DC);
      }
    } else {
      List<String> details =
          List.of(
              quota.availableLabel(),
              "Utilisé : " + StorageQuota.formatBytes(quota.usedBytes()),
              "Envois réservés : " + StorageQuota.formatBytes(quota.reservedBytes()),
              "Effacement en attente : " + StorageQuota.formatBytes(quota.pendingDeletionBytes()));
      for (int i = 0; i < details.size(); i++) {
        graphics.drawString(font, details.get(i), left + 14, top + 34 + i * 13, 0xFFECE8DC);
      }
    }
    var help = font.split(Component.literal(StorageQuota.CLEANUP_HELP), panelWidth - 28);
    for (int i = 0; i < Math.min(7, help.size()); i++) {
      graphics.drawString(font, help.get(i), left + 14, top + 97 + i * 10, 0xFFB2B6AA);
    }
  }

  @Override
  public void onClose() {
    if (minecraft != null) minecraft.setScreen(parent);
  }
}
