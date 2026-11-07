package dev.minemories.client;

import java.util.ArrayList;
import java.util.List;
import net.minecraft.ChatFormatting;
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
  private static final int COLOR_TEXT = UiTheme.TEXT;
  private static final int COLOR_MUTED = UiTheme.MUTED;
  private static final int PANEL_HEIGHT = 236;
  private static final int CONTENT_Y = 64;
  private final Screen parent;
  private final List<List<AbstractWidget>> tabWidgets = new ArrayList<>();
  private final List<TabButton> tabButtons = new ArrayList<>();
  private AdvancedTab tab = AdvancedTab.ACCOUNT;
  private EditBox apiInput;
  private EditBox directoryInput;
  private Button historyButton;
  private Button unlinkButton;
  private Button localButton;
  private Button selectionButton;
  private Button saveButton;
  private Button defaultsButton;
  private Button storageButton;
  private String status = I18n.get("minemories.ui.ready");
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
            I18n.get("minemories.ui.save"),
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
      TabButton tabButton =
          addRenderableWidget(
              new TabButton(
                  left + 14 + each.ordinal() * (width + 4),
                  top + 34,
                  width,
                  20,
                  Component.translatable(each.labelKey()),
                  ignored -> selectTab(each)));
      tabButtons.add(tabButton);
    }
    button(null, I18n.get("minemories.ui.back"), panelWidth - 14 - back, 34, back, this::onClose);
  }

  private void selectTab(AdvancedTab selected) {
    tab = selected;
    for (int i = 0; i < tabWidgets.size(); i++) {
      boolean shown = i == selected.ordinal();
      for (AbstractWidget widget : tabWidgets.get(i)) widget.visible = shown;
      tabButtons.get(i).setSelected(shown);
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
            I18n.get("minemories.ui.api_address"),
            CONTENT_Y + 14,
            panelWidth - 28);
    directoryInput =
        input(
            AdvancedTab.CAPTURES,
            I18n.get("minemories.ui.local_export_folder"),
            CONTENT_Y + 14,
            panelWidth - 28);
    directoryInput.setTooltip(
        Tooltip.create(Component.literal(I18n.get("minemories.ui.local_export_folder_hint"))));
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
            I18n.get("minemories.ui.official_address"),
            14,
            y,
            half,
            () -> apiInput.setValue(ClientSettings.DEFAULT_API_URL));
    defaultsButton.setTooltip(
        Tooltip.create(Component.translatable("minemories.ui.official_address_hint")));
    storageButton =
        button(
            AdvancedTab.ACCOUNT,
            I18n.get("minemories.ui.storage"),
            20 + half,
            y,
            half,
            this::openStorage);
    unlinkButton =
        button(
            AdvancedTab.ACCOUNT,
            I18n.get("minemories.ui.disconnect_account"),
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
            I18n.get("minemories.ui.export_locally"),
            14,
            y,
            half,
            () -> capture(false));
    selectionButton =
        button(
            AdvancedTab.CAPTURES,
            I18n.get("minemories.ui.export_selection"),
            20 + half,
            y,
            half,
            () -> capture(true));
    selectionButton.setTooltip(
        Tooltip.create(Component.translatable("minemories.ui.export_selection_hint")));
    button(
        AdvancedTab.CAPTURES,
        I18n.get("minemories.ui.auto_captures"),
        14,
        y + 26,
        half,
        () -> Minecraft.getInstance().setScreen(new AfkSettingsScreen(this)));
    historyButton =
        button(
            AdvancedTab.CAPTURES,
            I18n.get("minemories.ui.local_captures"),
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
            I18n.get("minemories.ui.world"),
            14,
            y,
            panelWidth - 28,
            () -> Minecraft.getInstance().setScreen(new TemporalWorldScreen(this)));
    worldButton.setTooltip(Tooltip.create(Component.translatable("minemories.ui.world_hint")));
    button(
        AdvancedTab.WORLD,
        I18n.get("minemories.ui.suggested_areas"),
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
      status = I18n.get("minemories.ui.unreadable_settings") + ClientRuntime.pairingError(error);
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
              ? I18n.get("minemories.ui.settings_saved_reconnect_account")
              : I18n.get("minemories.ui.settings_saved");
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
              ? I18n.get("minemories.ui.local_file_saved_nothing_sent")
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
      status = I18n.get("minemories.ui.account_disconnected_memories_kept");
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
    UiTheme.panel(graphics, left, top, panelWidth, PANEL_HEIGHT);
    graphics.drawString(
        font,
        Component.translatable("minemories.advanced.title").withStyle(ChatFormatting.BOLD),
        left + 14,
        top + 14,
        COLOR_TEXT);
    String hint =
        switch (tab) {
          case ACCOUNT -> I18n.get("minemories.ui.api_address_https");
          case CAPTURES -> I18n.get("minemories.ui.local_folder_history_kept");
          case WORLD, PRIVACY -> "";
        };
    graphics.drawString(font, hint, left + 14, top + CONTENT_Y, COLOR_MUTED);
  }

  @Override
  public void onClose() {
    if (this.minecraft != null) this.minecraft.setScreen(parent);
  }
}
