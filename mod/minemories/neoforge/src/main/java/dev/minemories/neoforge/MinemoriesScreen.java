package dev.minemories.neoforge;

import java.nio.file.Files;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

final class MinemoriesScreen extends Screen {
  private static final int CAPTURE_RADIUS = 8;
  private static final int COLOR_PANEL = 0xF0252926;
  private static final int COLOR_INSET = 0xC9191C1A;
  private static final int COLOR_EDGE = 0xFF667063;
  private static final int COLOR_ACCENT = 0xFFD7BD81;
  private static final int COLOR_TEXT = 0xFFECE8DC;
  private static final int COLOR_MUTED = 0xFFB2B6AA;

  private final Screen parent;
  private EditBox codeInput;
  private Button pairButton;
  private Button nearbyButton;
  private Button selectionButton;
  private Button uploadButton;
  private String status = "Capture locale · envoi manuel";
  private boolean paired;
  private boolean busy;
  private boolean compact;
  private int panelWidth;
  private int panelHeight;
  private int left;
  private int top;

  MinemoriesScreen(Screen parent) {
    super(Component.literal("Minemories"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    super.init();
    compact = this.height < 238;
    panelWidth = Math.min(330, this.width - 12);
    panelHeight = compact ? Math.min(210, this.height - 8) : 230;
    left = (this.width - panelWidth) / 2;
    top = (this.height - panelHeight) / 2;
    int innerWidth = panelWidth - 28;
    int gap = 6;
    int half = (innerWidth - gap) / 2;

    this.addRenderableWidget(
        Button.builder(Component.literal("×"), button -> onClose())
            .bounds(left + panelWidth - 30, top + 9, 20, 20)
            .build());
    nearbyButton =
        this.addRenderableWidget(
            Button.builder(Component.literal("Autour de moi"), button -> capture(false))
                .bounds(left + 14, top + (compact ? 49 : 72), half, 20)
                .build());
    selectionButton =
        this.addRenderableWidget(
            Button.builder(Component.literal("Zone choisie"), button -> capture(true))
                .bounds(left + 14 + half + gap, top + (compact ? 49 : 72), half, 20)
                .build());
    codeInput =
        this.addRenderableWidget(
            new EditBox(
                this.font,
                left + 14,
                top + (compact ? 103 : 147),
                innerWidth - 80,
                20,
                Component.literal("Code d'appairage")));
    codeInput.setMaxLength(6);
    codeInput.setHint(Component.literal("Code à 6 chiffres"));
    codeInput.setFilter(value -> value.matches("\\d{0,6}"));
    codeInput.setResponder(value -> updateButtons());
    pairButton =
        this.addRenderableWidget(
            Button.builder(Component.literal("Lier"), button -> pair())
                .bounds(left + panelWidth - 94, top + (compact ? 103 : 147), 80, 20)
                .build());
    uploadButton =
        this.addRenderableWidget(
            Button.builder(Component.literal("Envoyer la capture"), button -> upload())
                .bounds(left + 14, top + (compact ? 132 : 176), innerWidth, 20)
                .build());

    try {
      paired = PairingClient.isPaired();
    } catch (RuntimeException error) {
      paired = false;
      status = "Configuration illisible : " + error.getMessage();
    }
    updateButtons();
  }

  private void updateButtons() {
    if (uploadButton == null) return;
    nearbyButton.active = !busy && Minecraft.getInstance().level != null;
    selectionButton.active = !busy && Minemories.hasSelection();
    pairButton.active = !busy && codeInput.getValue().matches("\\d{6}");
    uploadButton.active = !busy && paired && Files.isRegularFile(Minemories.capturePath());
  }

  private void capture(boolean selection) {
    try {
      int result = selection ? Minemories.exportSelection() : Minemories.export(CAPTURE_RADIUS);
      status =
          result == 1
              ? "Capture enregistrée : ~/export/capture.glb"
              : "Capture impossible. Vérifie la sélection.";
    } catch (RuntimeException error) {
      status = "Capture impossible : " + error.getMessage();
    }
    updateButtons();
  }

  private void pair() {
    String code = codeInput.getValue();
    if (!code.matches("\\d{6}")) return;
    busy = true;
    status = "Appairage en cours…";
    updateButtons();
    try {
      PairingClient.pair(code)
          .whenComplete(
              (message, error) ->
                  Minecraft.getInstance()
                      .execute(
                          () -> {
                            if (this.minecraft != null && this.minecraft.screen == this) {
                              busy = false;
                              if (error == null) paired = true;
                              status = error == null ? "Compte lié." : Minemories.pairingError(error);
                              updateButtons();
                            }
                          }));
    } catch (RuntimeException error) {
      busy = false;
      status = Minemories.pairingError(error);
      updateButtons();
    }
  }

  private void upload() {
    busy = true;
    status = "Envoi en cours…";
    updateButtons();
    try {
      PairingClient.uploadCapture(Minemories.capturePath())
          .whenComplete(
              (message, error) ->
                  Minecraft.getInstance()
                      .execute(
                          () -> {
                            if (this.minecraft != null && this.minecraft.screen == this) {
                              busy = false;
                              status = error == null ? message : Minemories.pairingError(error);
                              updateButtons();
                            }
                          }));
    } catch (RuntimeException error) {
      busy = false;
      status = Minemories.pairingError(error);
      updateButtons();
    }
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    this.renderBackground(graphics, mouseX, mouseY, partialTick);
    graphics.fill(left - 1, top - 1, left + panelWidth + 1, top + panelHeight + 1, COLOR_EDGE);
    graphics.fill(left, top, left + panelWidth, top + panelHeight, COLOR_PANEL);
    graphics.fill(left + 1, top + 1, left + panelWidth - 1, top + 3, COLOR_ACCENT);
    graphics.drawString(this.font, "MINEMORIES", left + 14, top + 14, COLOR_ACCENT);
    if (!compact) {
      graphics.drawString(
          this.font, "Garde un fragment de ton monde.", left + 14, top + 36, COLOR_MUTED);
    }
    graphics.drawString(
        this.font, "CAPTURER", left + 14, top + (compact ? 35 : 56), COLOR_TEXT);
    if (!compact) {
      graphics.drawString(
          this.font, "La prochaine capture remplace capture.glb.",
          left + 14, top + 101, COLOR_MUTED);
    }
    int divider = top + (compact ? 78 : 119);
    graphics.fill(left + 14, divider, left + panelWidth - 14, divider + 1, COLOR_EDGE);
    graphics.drawString(
        this.font, "COMPTE", left + 14, top + (compact ? 88 : 131), COLOR_TEXT);
    String linkStatus = paired ? "LIÉ" : "NON LIÉ";
    graphics.drawString(
        this.font, linkStatus,
        left + panelWidth - 14 - this.font.width(linkStatus),
        top + (compact ? 88 : 131),
        paired ? COLOR_ACCENT : COLOR_MUTED);
    int statusTop = top + (compact ? 164 : 205);
    graphics.fill(
        left + 14, statusTop - 5, left + panelWidth - 14, top + panelHeight - 10, COLOR_INSET);
    super.render(graphics, mouseX, mouseY, partialTick);
    var lines = this.font.split(Component.literal(status), panelWidth - 40);
    for (int i = 0; i < Math.min(2, lines.size()); i++) {
      graphics.drawString(this.font, lines.get(i), left + 20, statusTop + i * 10, COLOR_TEXT);
    }
  }

  @Override
  public void onClose() {
    if (this.minecraft != null) this.minecraft.setScreen(parent);
  }
}
