package dev.minemories.client;

import java.util.concurrent.CompletableFuture;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.language.I18n;
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
  private String status = I18n.get("minemories.ui.pret");
  private String service = I18n.get("minemories.ui.service_minemories");
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
            advanced
                ? I18n.get("minemories.ui.mode_simple")
                : I18n.get("minemories.ui.mode_avance"),
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
            I18n.get("minemories.ui.captures_locales"),
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
    button(
        I18n.get("minemories.ui.diagnostics"),
        panelWidth - 134,
        10,
        94,
        () -> Minecraft.getInstance().setScreen(new DiagnosticsSettingsScreen(this)));
    codeInput =
        input(I18n.get("minemories.ui.code_dappairage_a_six_chiffres"), 70, panelWidth - 110);
    codeInput.setMaxLength(6);
    codeInput.setHint(Component.translatable("minemories.ui.code_a_6_chiffres"));
    codeInput.setFilter(value -> value.matches("\\d{0,6}"));
    pairButton = button(I18n.get("minemories.ui.connecter"), panelWidth - 90, 70, 76, this::pair);
    unlinkButton =
        button(
            I18n.get("minemories.ui.deconnecter_ce_compte"), 14, 70, panelWidth - 28, this::unlink);
    snapshotButton =
        button(
            I18n.get("minemories.ui.capturer_et_envoyer"),
            14,
            97,
            panelWidth - 28,
            this::snapshotNow);
    afkButton =
        button(I18n.get("minemories.ui.captures_afk"), 14, 123, panelWidth - 28, this::toggleAfk);
    int half = (panelWidth - 34) / 2;
    storageButton =
        button(I18n.get("minemories.ui.espace_chargement"), 14, 176, half, this::openStorage);
    button(
        I18n.get("minemories.ui.zones_suggerees"),
        20 + half,
        176,
        half,
        () -> Minecraft.getInstance().setScreen(new SuggestedZonesScreen(this)));
    storageButton.setTooltip(
        Tooltip.create(
            Component.translatable("minemories.ui.voir_lespace_et_comment_liberer_ta_galerie")));
    codeInput.setResponder(value -> updateButtons());
    snapshotButton.setTooltip(
        Tooltip.create(
            Component.literal(
                I18n.get(
                    "minemories.ui.capture_les_blocs_charges_autour_de_toi_et_envoie_le_souvenir_dans_ta_galerie_privee"))));
  }

  private void initAdvanced() {
    int half = (panelWidth - 34) / 2;
    apiInput = input(I18n.get("minemories.ui.adresse_de_lapi"), 48, panelWidth - 28);
    directoryInput =
        input(I18n.get("minemories.ui.dossier_des_exports_locaux"), 92, panelWidth - 28);
    directoryInput.setTooltip(
        Tooltip.create(
            Component.literal(
                I18n.get(
                    "minemories.ui.chemin_absolu_ou_export_les_captures_datees_restent_dans_history_capture_glb_donne_le_dernier_export"))));
    try {
      apiInput.setValue(PairingClient.apiUrl());
      directoryInput.setValue(PairingClient.exportDirectory().toString());
    } catch (RuntimeException error) {
      apiInput.setValue(ClientSettings.DEFAULT_API_URL);
      status = ClientRuntime.pairingError(error);
    }
    saveButton =
        button(I18n.get("minemories.ui.enregistrer"), 14, 118, half, this::saveConfiguration);
    defaultsButton =
        button(
            "API Minemories",
            20 + half,
            118,
            half,
            () -> apiInput.setValue(ClientSettings.DEFAULT_API_URL));
    defaultsButton.setTooltip(
        Tooltip.create(
            Component.translatable(
                "minemories.ui.retablit_ladresse_officielle_clique_ensuite_sur_enregistrer")));
    localButton =
        button(I18n.get("minemories.ui.exporter_en_local"), 14, 144, half, () -> capture(false));
    selectionButton =
        button(
            I18n.get("minemories.ui.exporter_la_selection"),
            20 + half,
            144,
            half,
            () -> capture(true));
    selectionButton.setTooltip(
        Tooltip.create(
            Component.translatable(
                "minemories.ui.definis_les_deux_coins_avec_minemories_select_first_et_second")));
    int quarter = (panelWidth - 46) / 4;
    button(
        "AFK",
        14,
        170,
        quarter,
        () -> Minecraft.getInstance().setScreen(new AfkSettingsScreen(this)));
    storageButton =
        button(I18n.get("minemories.ui.stockage"), 20 + quarter, 170, quarter, this::openStorage);
    Button worldButton =
        button(
            I18n.get("minemories.ui.monde"),
            26 + quarter * 2,
            170,
            quarter,
            () -> Minecraft.getInstance().setScreen(new TemporalWorldScreen(this)));
    worldButton.setTooltip(
        Tooltip.create(
            Component.translatable("minemories.ui.identite_du_monde_distant_pour_la_timelapse")));
    button(
        I18n.get("minemories.ui.diagnostics"),
        32 + quarter * 3,
        170,
        quarter,
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
              ? I18n.get("minemories.ui.service_minemories")
              : I18n.get("minemories.ui.api_personnalisee");
    } catch (RuntimeException error) {
      paired = false;
      afk = false;
      status =
          I18n.get("minemories.ui.configuration_illisible") + ClientRuntime.pairingError(error);
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
      selectionButton.active = !waiting && ClientRuntime.hasSelection();
    } else {
      afkButton.active = !waiting;
      afkButton.setMessage(
          Component.translatable(
              afk ? "minemories.options.afk.enabled" : "minemories.options.afk.disabled"));
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
              ? I18n.get("minemories.ui.reglages_enregistres_reconnecte_ton_compte_a_cette_api")
              : I18n.get("minemories.ui.reglages_enregistres");
    } catch (RuntimeException error) {
      status = ClientRuntime.pairingError(error);
    }
    updateButtons();
  }

  private void capture(boolean selection) {
    try {
      int result =
          selection
              ? ClientRuntime.exportSelection()
              : ClientRuntime.export(PairingClient.afkOptions().radius());
      status =
          result == 1
              ? I18n.get("minemories.ui.fichier_local_enregistre_aucun_envoi")
              : ClientRuntime.captureFailure();
    } catch (RuntimeException error) {
      status = ClientRuntime.pairingError(error);
    }
    updateButtons();
  }

  private void snapshotNow() {
    busy = true;
    status = I18n.get("minemories.ui.capture_en_cours");
    updateButtons();
    try {
      if (!paired) {
        busy = false;
        status = I18n.get("minemories.ui.connecte_ton_compte_avant_denvoyer_un_souvenir");
        updateButtons();
        return;
      }
      if (ClientRuntime.export(PairingClient.afkOptions().radius()) != 1) {
        busy = false;
        status = ClientRuntime.captureFailure();
        updateButtons();
        return;
      }
      status = I18n.get("minemories.ui.envoi_en_cours");
      complete(
          PairingClient.uploadCapture(ClientRuntime.latestCapturePath()),
          I18n.get("minemories.ui.souvenir_envoye_dans_ta_galerie"));
    } catch (RuntimeException error) {
      busy = false;
      status = ClientRuntime.pairingError(error);
      updateButtons();
    }
  }

  private void toggleAfk() {
    try {
      PairingClient.setAfkSnapshots(!afk);
      refreshSettings();
      status =
          afk
              ? I18n.get("minemories.ui.captures_afk_activees_meme_en_pause")
              : I18n.get("minemories.ui.captures_automatiques_desactivees");
    } catch (RuntimeException error) {
      status = ClientRuntime.pairingError(error);
    }
    updateButtons();
  }

  private void pair() {
    busy = true;
    status = I18n.get("minemories.ui.connexion_du_compte");
    updateButtons();
    try {
      complete(
          PairingClient.pair(codeInput.getValue()),
          I18n.get("minemories.ui.compte_connecte_tu_peux_capturer_et_envoyer"));
    } catch (RuntimeException error) {
      busy = false;
      status = ClientRuntime.pairingError(error);
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
                      status = error == null ? success : ClientRuntime.pairingError(error);
                      if (this.minecraft != null && this.minecraft.screen == this) updateButtons();
                    }));
  }

  private void unlink() {
    try {
      PairingClient.unlink();
      refreshSettings();
      status = I18n.get("minemories.ui.compte_deconnecte_tes_souvenirs_en_ligne_sont_conserves");
    } catch (RuntimeException error) {
      status = ClientRuntime.pairingError(error);
    }
    updateButtons();
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    int statusTop = top + (advanced ? 200 : 201);
    String captureStatus = ClientRuntime.afkCaptureStatus();
    var lines =
        this.font.split(
            Component.literal(captureStatus.isEmpty() ? status : captureStatus), panelWidth - 28);
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
      graphics.drawString(
          font, I18n.get("minemories.ui.adresse_de_lapi_https"), left + 14, top + 35, COLOR_TEXT);
      graphics.drawString(
          font,
          I18n.get("minemories.ui.dossier_local_historique_conserve"),
          left + 14,
          top + 79,
          COLOR_TEXT);
    } else {
      graphics.drawString(font, "MINEMORIES", left + 14, top + 14, COLOR_TEXT);
      graphics.drawString(
          font,
          service
              + (paired
                  ? I18n.get("minemories.ui.compte_connecte")
                  : I18n.get("minemories.ui.non_connecte")),
          left + 14,
          top + 36,
          COLOR_MUTED);
      graphics.drawString(
          font,
          paired
              ? (afk
                  ? I18n.get("minemories.ui.souvenirs_afk_automatiques_meme_en_pause")
                  : I18n.get("minemories.ui.envoi_uniquement_avec_le_bouton_ci_dessous"))
              : afk
                  ? I18n.get("minemories.ui.afk_local_actif_connecte_ta_galerie_pour_lenvoi")
                  : I18n.get("minemories.ui.entre_le_code_genere_dans_ta_galerie_web"),
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
