package dev.minemories.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.language.I18n;
import net.minecraft.network.chat.Component;

final class AdvancedScreen extends Screen {
  private static final int COLOR_PANEL = 0xFF252926;
  private static final int COLOR_TEXT = 0xFFECE8DC;
  private static final int PANEL_HEIGHT = 282;
  private final Screen parent;
  private EditBox apiInput;
  private EditBox directoryInput;
  private Button historyButton;
  private Button unlinkButton;
  private Button localButton;
  private Button selectionButton;
  private Button saveButton;
  private Button defaultsButton;
  private Button storageButton;
  private String status = I18n.get("minemories.ui.pret");
  private boolean paired;
  private int panelWidth;
  private int left;
  private int top;

  AdvancedScreen(Screen parent) {
    super(Component.translatable("minemories.advanced.title"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    super.init();
    panelWidth = Math.min(390, this.width - 12);
    left = (this.width - panelWidth) / 2;
    top = Math.max(4, (this.height - PANEL_HEIGHT) / 2);
    historyButton =
        button(
            I18n.get("minemories.ui.captures_locales"),
            14,
            10,
            panelWidth - 92,
            () -> Minecraft.getInstance().setScreen(new CaptureHistoryScreen(this)));
    button(I18n.get("minemories.ui.retour"), panelWidth - 72, 10, 58, this::onClose);
    initFields();
    initButtons();
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

  private void initFields() {
    apiInput = input(I18n.get("minemories.ui.adresse_de_lapi"), 66, panelWidth - 28);
    directoryInput =
        input(I18n.get("minemories.ui.dossier_des_exports_locaux"), 108, panelWidth - 28);
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
  }

  private void initButtons() {
    int half = (panelWidth - 34) / 2;
    int quarter = (panelWidth - 46) / 4;
    saveButton =
        button(I18n.get("minemories.ui.enregistrer"), 14, 134, half, this::saveConfiguration);
    defaultsButton =
        button(
            "API Minemories",
            20 + half,
            134,
            half,
            () -> apiInput.setValue(ClientSettings.DEFAULT_API_URL));
    defaultsButton.setTooltip(
        Tooltip.create(
            Component.translatable(
                "minemories.ui.retablit_ladresse_officielle_clique_ensuite_sur_enregistrer")));
    localButton =
        button(I18n.get("minemories.ui.exporter_en_local"), 14, 160, half, () -> capture(false));
    selectionButton =
        button(
            I18n.get("minemories.ui.exporter_la_selection"),
            20 + half,
            160,
            half,
            () -> capture(true));
    selectionButton.setTooltip(
        Tooltip.create(
            Component.translatable(
                "minemories.ui.definis_les_deux_coins_avec_minemories_select_first_et_second")));
    button(
        "AFK",
        14,
        186,
        quarter,
        () -> Minecraft.getInstance().setScreen(new AfkSettingsScreen(this)));
    storageButton =
        button(I18n.get("minemories.ui.stockage"), 20 + quarter, 186, quarter, this::openStorage);
    Button worldButton =
        button(
            I18n.get("minemories.ui.monde"),
            26 + quarter * 2,
            186,
            quarter,
            () -> Minecraft.getInstance().setScreen(new TemporalWorldScreen(this)));
    worldButton.setTooltip(
        Tooltip.create(
            Component.translatable("minemories.ui.identite_du_monde_distant_pour_la_timelapse")));
    button(
        I18n.get("minemories.ui.diagnostics"),
        32 + quarter * 3,
        186,
        quarter,
        () -> Minecraft.getInstance().setScreen(new DiagnosticsSettingsScreen(this)));
    button(
        I18n.get("minemories.ui.zones_suggerees"),
        14,
        212,
        half,
        () -> Minecraft.getInstance().setScreen(new SuggestedZonesScreen(this)));
    unlinkButton =
        button(I18n.get("minemories.ui.deconnecter_ce_compte"), 20 + half, 212, half, this::unlink);
  }

  private void openStorage() {
    Minecraft.getInstance().setScreen(new StorageQuotaScreen(this));
  }

  private void refreshSettings() {
    try {
      paired = PairingClient.isPaired();
    } catch (RuntimeException error) {
      paired = false;
      status =
          I18n.get("minemories.ui.configuration_illisible") + ClientRuntime.pairingError(error);
    }
  }

  private void updateButtons() {
    boolean waiting = PairingClient.isUploading();
    Minecraft mc = Minecraft.getInstance();
    historyButton.active = !waiting;
    saveButton.active = !waiting;
    defaultsButton.active = !waiting;
    apiInput.setEditable(!waiting);
    directoryInput.setEditable(!waiting);
    localButton.active = !waiting && mc.level != null;
    selectionButton.active = !waiting && ClientRuntime.hasSelection();
    storageButton.active = paired;
    unlinkButton.visible = paired;
    unlinkButton.active = !waiting;
  }

  @Override
  public void tick() {
    super.tick();
    updateButtons();
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
    String captureStatus = ClientRuntime.afkCaptureStatus();
    var lines =
        this.font.split(
            Component.literal(captureStatus.isEmpty() ? status : captureStatus), panelWidth - 28);
    for (int i = 0; i < Math.min(3, lines.size()); i++) {
      graphics.drawString(this.font, lines.get(i), left + 14, top + 240 + i * 10, COLOR_TEXT);
    }
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    graphics.fill(left - 1, top - 1, left + panelWidth + 1, top + PANEL_HEIGHT + 1, 0xFF667063);
    graphics.fill(left, top, left + panelWidth, top + PANEL_HEIGHT, COLOR_PANEL);
    graphics.drawString(
        font, I18n.get("minemories.advanced.title"), left + 14, top + 38, COLOR_TEXT);
    graphics.drawString(
        font, I18n.get("minemories.ui.adresse_de_lapi_https"), left + 14, top + 53, COLOR_TEXT);
    graphics.drawString(
        font,
        I18n.get("minemories.ui.dossier_local_historique_conserve"),
        left + 14,
        top + 95,
        COLOR_TEXT);
  }

  @Override
  public void onClose() {
    if (this.minecraft != null) this.minecraft.setScreen(parent);
  }
}
