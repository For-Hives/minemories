package dev.minemories.client;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.language.I18n;
import net.minecraft.network.chat.Component;

final class AdvancedScreen extends Screen {
  private static final int COLOR_PANEL = 0xFF252926;
  private static final int COLOR_TEXT = 0xFFECE8DC;
  private static final int COLOR_MUTED = 0xFFB2B6AA;
  private static final int PANEL_HEIGHT = 236;
  private static final int CONTENT_Y = 64;
  private static AdvancedTab rememberedTab = AdvancedTab.ACCOUNT;
  private final Screen parent;
  private final List<List<AbstractWidget>> tabWidgets = new ArrayList<>();
  private final List<Button> tabButtons = new ArrayList<>();
  private AdvancedTab tab = rememberedTab;
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
    tabWidgets.clear();
    tabButtons.clear();
    for (int i = 0; i < AdvancedTab.values().length; i++) tabWidgets.add(new ArrayList<>());
    panelWidth = Math.min(390, this.width - 12);
    left = (this.width - panelWidth) / 2;
    top = Math.max(4, (this.height - PANEL_HEIGHT) / 2);
    initTabBar();
    initFields();
    initAccount();
    initCaptures();
    initWorld();
    initPrivacy();
    saveButton =
        button(
            null,
            I18n.get("minemories.ui.enregistrer"),
            14,
            PANEL_HEIGHT - 66,
            panelWidth - 28,
            this::saveConfiguration);
    refreshSettings();
    selectTab(tab);
  }

  private void initTabBar() {
    int count = AdvancedTab.values().length;
    int back = 58;
    int width = (panelWidth - 28 - back - 4 * count) / count;
    for (AdvancedTab each : AdvancedTab.values()) {
      Button tabButton =
          button(
              null,
              I18n.get(each.labelKey()),
              14 + each.ordinal() * (width + 4),
              34,
              width,
              () -> selectTab(each));
      tabButtons.add(tabButton);
    }
    button(null, I18n.get("minemories.ui.retour"), panelWidth - 14 - back, 34, back, this::onClose);
  }

  private void selectTab(AdvancedTab selected) {
    tab = selected;
    rememberedTab = selected;
    for (int i = 0; i < tabWidgets.size(); i++) {
      boolean shown = i == selected.ordinal();
      for (AbstractWidget widget : tabWidgets.get(i)) widget.visible = shown;
      tabButtons.get(i).active = !shown;
    }
    updateButtons();
  }

  private <T extends AbstractWidget> T register(AdvancedTab owner, T widget) {
    if (owner != null) tabWidgets.get(owner.ordinal()).add(widget);
    return addRenderableWidget(widget);
  }

  private Button button(AdvancedTab owner, String label, int x, int y, int width, Runnable action) {
    return register(
        owner,
        Button.builder(Component.literal(label), ignored -> action.run())
            .bounds(left + x, top + y, width, 20)
            .build());
  }

  private EditBox input(AdvancedTab owner, String label, int y, int width) {
    EditBox field =
        register(owner, new EditBox(font, left + 14, top + y, width, 20, Component.literal(label)));
    field.setMaxLength(2048);
    return field;
  }

  private void initFields() {
    apiInput =
        input(
            AdvancedTab.ACCOUNT,
            I18n.get("minemories.ui.adresse_de_lapi"),
            CONTENT_Y + 14,
            panelWidth - 28);
    directoryInput =
        input(
            AdvancedTab.CAPTURES,
            I18n.get("minemories.ui.dossier_des_exports_locaux"),
            CONTENT_Y + 14,
            panelWidth - 28);
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

  private void initAccount() {
    int half = (panelWidth - 34) / 2;
    int y = CONTENT_Y + 40;
    defaultsButton =
        button(
            AdvancedTab.ACCOUNT,
            "API Minemories",
            14,
            y,
            half,
            () -> apiInput.setValue(ClientSettings.DEFAULT_API_URL));
    defaultsButton.setTooltip(
        Tooltip.create(
            Component.translatable(
                "minemories.ui.retablit_ladresse_officielle_clique_ensuite_sur_enregistrer")));
    storageButton =
        button(
            AdvancedTab.ACCOUNT,
            I18n.get("minemories.ui.stockage"),
            20 + half,
            y,
            half,
            this::openStorage);
    unlinkButton =
        button(
            AdvancedTab.ACCOUNT,
            I18n.get("minemories.ui.deconnecter_ce_compte"),
            14,
            y + 26,
            panelWidth - 28,
            this::unlink);
  }

  private void initCaptures() {
    int half = (panelWidth - 34) / 2;
    int y = CONTENT_Y + 40;
    localButton =
        button(
            AdvancedTab.CAPTURES,
            I18n.get("minemories.ui.exporter_en_local"),
            14,
            y,
            half,
            () -> capture(false));
    selectionButton =
        button(
            AdvancedTab.CAPTURES,
            I18n.get("minemories.ui.exporter_la_selection"),
            20 + half,
            y,
            half,
            () -> capture(true));
    selectionButton.setTooltip(
        Tooltip.create(
            Component.translatable(
                "minemories.ui.definis_les_deux_coins_avec_minemories_select_first_et_second")));
    button(
        AdvancedTab.CAPTURES,
        "AFK",
        14,
        y + 26,
        half,
        () -> Minecraft.getInstance().setScreen(new AfkSettingsScreen(this)));
    historyButton =
        button(
            AdvancedTab.CAPTURES,
            I18n.get("minemories.ui.captures_locales"),
            20 + half,
            y + 26,
            half,
            () -> Minecraft.getInstance().setScreen(new CaptureHistoryScreen(this)));
  }

  private void initWorld() {
    int y = CONTENT_Y + 14;
    Button worldButton =
        button(
            AdvancedTab.WORLD,
            I18n.get("minemories.ui.monde"),
            14,
            y,
            panelWidth - 28,
            () -> Minecraft.getInstance().setScreen(new TemporalWorldScreen(this)));
    worldButton.setTooltip(
        Tooltip.create(
            Component.translatable("minemories.ui.identite_du_monde_distant_pour_la_timelapse")));
    button(
        AdvancedTab.WORLD,
        I18n.get("minemories.ui.zones_suggerees"),
        14,
        y + 26,
        panelWidth - 28,
        () -> Minecraft.getInstance().setScreen(new SuggestedZonesScreen(this)));
  }

  private void initPrivacy() {
    button(
        AdvancedTab.PRIVACY,
        I18n.get("minemories.ui.diagnostics"),
        14,
        CONTENT_Y + 14,
        panelWidth - 28,
        () -> Minecraft.getInstance().setScreen(new DiagnosticsSettingsScreen(this)));
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
    unlinkButton.visible = paired && tab == AdvancedTab.ACCOUNT;
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
      graphics.drawString(
          this.font, lines.get(i), left + 14, top + PANEL_HEIGHT - 38 + i * 10, COLOR_TEXT);
    }
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    graphics.fill(left - 1, top - 1, left + panelWidth + 1, top + PANEL_HEIGHT + 1, 0xFF667063);
    graphics.fill(left, top, left + panelWidth, top + PANEL_HEIGHT, COLOR_PANEL);
    graphics.drawString(
        font, I18n.get("minemories.advanced.title"), left + 14, top + 14, COLOR_TEXT);
    String hint =
        switch (tab) {
          case ACCOUNT -> I18n.get("minemories.ui.adresse_de_lapi_https");
          case CAPTURES -> I18n.get("minemories.ui.dossier_local_historique_conserve");
          case WORLD, PRIVACY -> "";
        };
    graphics.drawString(font, hint, left + 14, top + CONTENT_Y, COLOR_MUTED);
  }

  @Override
  public void onClose() {
    if (this.minecraft != null) this.minecraft.setScreen(parent);
  }
}
