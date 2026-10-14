package dev.minemories.neoforge;

import java.util.concurrent.CompletableFuture;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

final class MinemoriesScreen extends Screen {
  private static final int COLOR_PANEL = 0xFF252926;
  private static final int COLOR_TEXT = 0xFFECE8DC;
  private static final int COLOR_MUTED = 0xFFB2B6AA;
  private final Screen parent;
  private EditBox codeInput;
  private EditBox apiInput;
  private EditBox directoryInput;
  private Button pairButton;
  private Button unlinkButton;
  private Button snapshotButton;
  private Button localButton;
  private Button selectionButton;
  private Button afkButton;
  private Button saveButton;
  private Button defaultsButton;
  private Button modeButton;
  private Button storageButton;
  private Button historyButton;
  private final StorageStatusView storage = new StorageStatusView();
  private String status = "Aucun envoi sans ton accord.";
  private String service = "Service Minemories";
  private boolean paired;
  private boolean afk;
  private boolean busy;
  private boolean advanced;
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
    panelWidth = Math.min(390, this.width - 12);
    panelHeight = 236;
    left = (this.width - panelWidth) / 2;
    top = Math.max(4, (this.height - panelHeight) / 2);
    modeButton =
        button(
            advanced ? "Mode simple" : "Mode avancé",
            14,
            advanced ? 10 : 149,
            (panelWidth - (advanced ? 60 : 34)) / 2,
            () -> {
              advanced = !advanced;
              rebuildWidgets();
            });
    int historyWidth = (panelWidth - (advanced ? 60 : 34)) / 2;
    historyButton =
        button(
            "Captures locales",
            20 + historyWidth,
            advanced ? 10 : 149,
            historyWidth,
            () -> Minecraft.getInstance().setScreen(new CaptureHistoryScreen(this)));
    button("×", panelWidth - 34, 10, 20, this::onClose);
    if (advanced) initAdvanced();
    else initBasic();
    refreshSettings();
    updateButtons();
  }

  private Button button(String label, int x, int y, int width, Runnable action) {
    return addRenderableWidget(
        Button.builder(Component.literal(label), ignored -> action.run())
            .bounds(left + x, top + y, width, 20)
            .build());
  }

  private EditBox input(String label, int y, int width) {
    EditBox field =
        addRenderableWidget(
            new EditBox(font, left + 14, top + y, width, 20, Component.literal(label)));
    field.setMaxLength(2048);
    return field;
  }

  private void initBasic() {
    codeInput = input("Code d’appairage à six chiffres", 70, panelWidth - 110);
    codeInput.setMaxLength(6);
    codeInput.setHint(Component.literal("Code à 6 chiffres"));
    codeInput.setFilter(value -> value.matches("\\d{0,6}"));
    pairButton = button("Connecter", panelWidth - 90, 70, 76, this::pair);
    unlinkButton = button("Déconnecter ce compte", 14, 70, panelWidth - 28, this::unlink);
    snapshotButton = button("Capturer et envoyer", 14, 97, panelWidth - 28, this::snapshotNow);
    afkButton = button("Captures AFK", 14, 123, panelWidth - 28, this::toggleAfk);
    storageButton = button("Espace : chargement…", 14, 176, panelWidth - 28, this::openStorage);
    storageButton.setTooltip(
        Tooltip.create(Component.literal("Voir l’espace et comment libérer ta galerie.")));
    codeInput.setResponder(value -> updateButtons());
    snapshotButton.setTooltip(
        Tooltip.create(
            Component.literal(
                "Capture les blocs chargés autour de toi et envoie le souvenir dans ta galerie privée.")));
  }

  private void initAdvanced() {
    int half = (panelWidth - 34) / 2;
    apiInput = input("Adresse de l’API", 48, panelWidth - 28);
    directoryInput = input("Dossier des exports locaux", 92, panelWidth - 28);
    directoryInput.setTooltip(
        Tooltip.create(
            Component.literal(
                "Chemin absolu ou ~/export. Les captures datées restent dans history ; capture.glb donne le dernier export.")));
    try {
      apiInput.setValue(PairingClient.apiUrl());
      directoryInput.setValue(PairingClient.exportDirectory().toString());
    } catch (RuntimeException error) {
      apiInput.setValue(ClientSettings.DEFAULT_API_URL);
      status = Minemories.pairingError(error);
    }
    saveButton = button("Enregistrer", 14, 118, half, this::saveConfiguration);
    defaultsButton =
        button(
            "API Minemories",
            20 + half,
            118,
            half,
            () -> apiInput.setValue(ClientSettings.DEFAULT_API_URL));
    defaultsButton.setTooltip(
        Tooltip.create(
            Component.literal("Rétablit l’adresse officielle. Clique ensuite sur Enregistrer.")));
    localButton = button("Exporter en local", 14, 144, half, () -> capture(false));
    selectionButton = button("Exporter la sélection", 20 + half, 144, half, () -> capture(true));
    selectionButton.setTooltip(
        Tooltip.create(
            Component.literal("Définis les deux coins avec /minemories select first et second.")));
    int third = (panelWidth - 40) / 3;
    button(
        "Réglages AFK",
        14,
        170,
        third,
        () -> Minecraft.getInstance().setScreen(new AfkSettingsScreen(this)));
    storageButton = button("Stockage", 20 + third, 170, third, this::openStorage);
    button(
        "Diagnostics",
        26 + third * 2,
        170,
        third,
        () -> Minecraft.getInstance().setScreen(new DiagnosticsSettingsScreen(this)));
  }

  private void openStorage() {
    Minecraft.getInstance().setScreen(new StorageQuotaScreen(this));
  }

  private void refreshSettings() {
    try {
      paired = PairingClient.isPaired();
      afk = PairingClient.isAfkSnapshots();
      service =
          ClientSettings.DEFAULT_API_URL.equals(PairingClient.apiUrl())
              ? "Service Minemories"
              : "API personnalisée";
    } catch (RuntimeException error) {
      paired = false;
      afk = false;
      status = "Configuration illisible : " + Minemories.pairingError(error);
    }
    storage.reset(paired);
  }

  private void updateButtons() {
    if (modeButton == null) return;
    boolean waiting = busy || PairingClient.isUploading();
    modeButton.active = !waiting;
    historyButton.active = !waiting;
    storageButton.active = paired;
    if (!advanced) storageButton.setMessage(Component.literal(storage.label()));
    Minecraft mc = Minecraft.getInstance();
    if (advanced) {
      saveButton.active = !waiting;
      defaultsButton.active = !waiting;
      apiInput.setEditable(!waiting);
      directoryInput.setEditable(!waiting);
      localButton.active = !waiting && mc.level != null;
      selectionButton.active = !waiting && Minemories.hasSelection();
    } else {
      afkButton.active = !waiting;
      afkButton.setMessage(
          Component.literal("Captures AFK : " + (afk ? "activées" : "désactivées")));
      codeInput.visible = !paired;
      pairButton.visible = !paired;
      unlinkButton.visible = paired;
      codeInput.setEditable(!waiting);
      pairButton.active = !waiting && codeInput.getValue().matches("\\d{6}");
      unlinkButton.active = !waiting;
      snapshotButton.active = !waiting && paired && mc.level != null;
    }
  }

  @Override
  public void tick() {
    super.tick();
    storage.update(
        System.currentTimeMillis(),
        paired,
        PairingClient::storageStatus,
        Minecraft.getInstance()::execute);
    updateButtons();
  }

  @Override
  public void removed() {
    storage.reset(false);
    super.removed();
  }

  private void saveConfiguration() {
    try {
      boolean changedApi = PairingClient.configure(apiInput.getValue(), directoryInput.getValue());
      refreshSettings();
      apiInput.setValue(PairingClient.apiUrl());
      directoryInput.setValue(PairingClient.exportDirectory().toString());
      status =
          changedApi
              ? "Réglages enregistrés. Reconnecte ton compte à cette API."
              : "Réglages enregistrés.";
    } catch (RuntimeException error) {
      status = Minemories.pairingError(error);
    }
    updateButtons();
  }

  private void capture(boolean selection) {
    try {
      int result =
          selection
              ? Minemories.exportSelection()
              : Minemories.export(PairingClient.afkOptions().radius());
      status = result == 1 ? "Fichier local enregistré. Aucun envoi." : Minemories.captureFailure();
    } catch (RuntimeException error) {
      status = Minemories.pairingError(error);
    }
    updateButtons();
  }

  private void snapshotNow() {
    busy = true;
    status = "Capture en cours…";
    updateButtons();
    try {
      if (!paired) {
        busy = false;
        status = "Connecte ton compte avant d’envoyer un souvenir.";
        updateButtons();
        return;
      }
      if (Minemories.export(PairingClient.afkOptions().radius()) != 1) {
        busy = false;
        status = Minemories.captureFailure();
        updateButtons();
        return;
      }
      status = "Envoi en cours…";
      complete(
          PairingClient.uploadCapture(Minemories.latestCapturePath()),
          "Souvenir envoyé dans ta galerie.");
    } catch (RuntimeException error) {
      busy = false;
      status = Minemories.pairingError(error);
      updateButtons();
    }
  }

  private void toggleAfk() {
    try {
      PairingClient.setAfkSnapshots(!afk);
      refreshSettings();
      status = afk ? "Captures AFK activées, même en pause." : "Captures automatiques désactivées.";
    } catch (RuntimeException error) {
      status = Minemories.pairingError(error);
    }
    updateButtons();
  }

  private void pair() {
    busy = true;
    status = "Connexion du compte…";
    updateButtons();
    try {
      complete(
          PairingClient.pair(codeInput.getValue()),
          "Compte connecté. Tu peux capturer et envoyer.");
    } catch (RuntimeException error) {
      busy = false;
      status = Minemories.pairingError(error);
      updateButtons();
    }
  }

  private void complete(CompletableFuture<String> operation, String success) {
    operation.whenComplete(
        (message, error) ->
            Minecraft.getInstance()
                .execute(
                    () -> {
                      busy = false;
                      refreshSettings();
                      status = error == null ? success : Minemories.pairingError(error);
                      if (this.minecraft != null && this.minecraft.screen == this) updateButtons();
                    }));
  }

  private void unlink() {
    try {
      PairingClient.unlink();
      refreshSettings();
      status = "Compte déconnecté. Tes souvenirs en ligne sont conservés.";
    } catch (RuntimeException error) {
      status = Minemories.pairingError(error);
    }
    updateButtons();
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    int statusTop = top + (advanced ? 200 : 201);
    var lines = this.font.split(Component.literal(status), panelWidth - 28);
    for (int i = 0; i < Math.min(3, lines.size()); i++) {
      graphics.drawString(this.font, lines.get(i), left + 14, statusTop + i * 10, COLOR_TEXT);
    }
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    graphics.fill(left - 1, top - 1, left + panelWidth + 1, top + panelHeight + 1, 0xFF667063);
    graphics.fill(left, top, left + panelWidth, top + panelHeight, COLOR_PANEL);
    if (advanced) {
      graphics.drawString(font, "Adresse de l’API (HTTPS)", left + 14, top + 35, COLOR_TEXT);
      graphics.drawString(
          font, "Dossier local (historique conservé)", left + 14, top + 79, COLOR_TEXT);
    } else {
      graphics.drawString(font, "MINEMORIES", left + 14, top + 14, COLOR_TEXT);
      graphics.drawString(
          font,
          service + (paired ? " · compte connecté" : " · non connecté"),
          left + 14,
          top + 36,
          COLOR_MUTED);
      graphics.drawString(
          font,
          paired
              ? (afk
                  ? "Souvenirs AFK automatiques, même en pause."
                  : "Envoi uniquement avec le bouton ci-dessous.")
              : afk
                  ? "AFK local actif. Connecte ta galerie pour l’envoi."
                  : "Entre le code généré dans ta galerie web.",
          left + 14,
          top + 53,
          COLOR_MUTED);
    }
  }

  @Override
  public void onClose() {
    if (this.minecraft != null) this.minecraft.setScreen(parent);
  }
}
