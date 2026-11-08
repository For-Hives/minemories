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
  private static final int PANEL_HEIGHT = 262;
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
  private final StorageStatusView storage = new StorageStatusView();
  private boolean editingApi;
  private Button privacyToggle;
  private boolean diagnostics;
  private String diagnosticsError;
  private String diagnosticsStatus = "";
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
    storage.reset(paired);
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
    int y = CONTENT_Y + 62;
    defaultsButton = button(AdvancedTab.ACCOUNT, "", 14, y, half, this::toggleApiEditing);
    updateApiButton();
    unlinkButton =
        button(
            AdvancedTab.ACCOUNT,
            I18n.get("minemories.ui.disconnect_account"),
            20 + half,
            y,
            half,
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
    button(
        AdvancedTab.CAPTURES,
        I18n.get("minemories.ui.auto_captures"),
        14,
        y + 26,
        half,
        () -> Minecraft.getInstance().setScreen(new AfkSettingsScreen(this)));
    button(
        AdvancedTab.CAPTURES,
        I18n.get("minemories.ui.memory_size"),
        14,
        y + 52,
        half,
        () -> Minecraft.getInstance().setScreen(new MemorySizeScreen(this)));
    button(
        AdvancedTab.CAPTURES,
        I18n.get("minemories.ui.suggested_areas"),
        20 + half,
        y + 52,
        half,
        () -> Minecraft.getInstance().setScreen(new SuggestedZonesScreen(this)));
    historyButton =
        button(
            AdvancedTab.CAPTURES,
            I18n.get("minemories.ui.local_captures"),
            20 + half,
            y + 26,
            half,
            () -> Minecraft.getInstance().setScreen(new CaptureHistoryScreen(this)));
  }

  private void initPrivacy() {
    privacyToggle =
        button(AdvancedTab.PRIVACY, "", 14, CONTENT_Y, panelWidth - 28, this::changeDiagnostics);
    privacyToggle.setTooltip(
        Tooltip.create(
            Component.literal(
                I18n.get("minemories.ui.diagnostics_contents")
                    + "\n"
                    + I18n.get("minemories.ui.diagnostics_exclusions")
                    + "\n"
                    + I18n.get("minemories.ui.diagnostics_off_effect"))));
  }

  private void changeDiagnostics() {
    try {
      PairingClient.setDiagnosticsConsent(!diagnostics);
      diagnosticsError = null;
    } catch (RuntimeException ignored) {
      diagnosticsError =
          diagnostics
              ? I18n.get("minemories.ui.withdrawal_not_saved_fix_permissions")
              : I18n.get("minemories.ui.setting_not_saved_retry");
    }
    refreshDiagnostics();
  }

  private void refreshDiagnostics() {
    try {
      diagnostics = PairingClient.diagnosticsConsent();
      privacyToggle.active = diagnostics || paired;
      privacyToggle.setMessage(
          Component.translatable(
              diagnostics
                  ? "minemories.options.diagnostics.enabled"
                  : "minemories.ui.diagnostics_off"));
      diagnosticsStatus =
          diagnosticsError != null ? diagnosticsError : PairingClient.diagnosticsStatus();
    } catch (RuntimeException ignored) {
      privacyToggle.active = false;
      diagnosticsStatus = I18n.get("minemories.ui.unreadable_settings_no_collection");
    }
  }

  private void drawPrivacy(GuiGraphics graphics) {
    int y = top + CONTENT_Y + 30;
    for (var line :
        font.split(Component.translatable("minemories.ui.privacy_short"), panelWidth - 28)) {
      graphics.drawString(font, line, left + 14, y, COLOR_TEXT);
      y += 10;
    }
    y += 6;
    var statusLines = font.split(Component.literal(diagnosticsStatus), panelWidth - 28);
    for (int i = 0; i < Math.min(2, statusLines.size()); i++) {
      graphics.drawString(font, statusLines.get(i), left + 14, y + i * 10, COLOR_MUTED);
    }
  }

  /** The server address is locked: a typo would send the player's account to the wrong place. */
  private void toggleApiEditing() {
    editingApi = !editingApi;
    if (!editingApi) apiInput.setValue(ClientSettings.DEFAULT_API_URL);
    updateApiButton();
    updateButtons();
  }

  private void updateApiButton() {
    defaultsButton.setMessage(
        Component.translatable(
            editingApi ? "minemories.ui.official_address" : "minemories.ui.change_server"));
    defaultsButton.setTooltip(
        Tooltip.create(
            Component.translatable(
                editingApi
                    ? "minemories.ui.official_address_hint"
                    : "minemories.ui.change_server_hint")));
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
    apiInput.setEditable(!waiting && editingApi);
    apiInput.setTooltip(
        editingApi ? null : Tooltip.create(Component.translatable("minemories.ui.api_locked")));
    directoryInput.setEditable(!waiting);
    localButton.active = !waiting && mc.level != null;
    localButton.setTooltip(needWorld(mc.level != null));
    selectionButton.active = !waiting && ClientRuntime.hasSelection();
    selectionButton.setTooltip(
        Tooltip.create(
            Component.translatable(
                mc.level == null
                    ? "minemories.hub.need_world"
                    : "minemories.ui.export_selection_hint")));
    apiInput.visible = tab == AdvancedTab.ACCOUNT && editingApi;
    saveButton.visible = tab != AdvancedTab.PRIVACY;
    if (tab == AdvancedTab.PRIVACY) refreshDiagnostics();
    unlinkButton.visible = paired && tab == AdvancedTab.ACCOUNT;
    unlinkButton.active = !waiting;
  }

  private static Tooltip needWorld(boolean inWorld) {
    return inWorld ? null : Tooltip.create(Component.translatable("minemories.hub.need_world"));
  }

  @Override
  public void removed() {
    storage.reset(false);
    super.removed();
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
      int result = selection ? ClientRuntime.exportSelection() : ClientRuntime.exportManual();
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
          case ACCOUNT -> editingApi ? I18n.get("minemories.ui.api_address_warning") : "";
          case CAPTURES -> I18n.get("minemories.ui.local_folder_history_kept");
          case PRIVACY -> "";
        };
    graphics.drawString(font, hint, left + 14, top + CONTENT_Y, COLOR_MUTED);
    if (tab == AdvancedTab.ACCOUNT && !editingApi) drawAccount(graphics);
    if (tab == AdvancedTab.PRIVACY) drawPrivacy(graphics);
  }

  /** Who is connected, to which server, and how much gallery space is left. */
  private void drawAccount(GuiGraphics graphics) {
    int x = left + 14;
    StorageQuota quota = storage.quota();
    String name = quota == null ? null : quota.accountName();
    Component who =
        !paired
            ? Component.translatable("minemories.hub.not_connected")
            : name == null
                ? Component.translatable("minemories.hub.connected")
                : Component.translatable("minemories.ui.account_as", name);
    graphics.drawString(
        font,
        who.copy().withStyle(ChatFormatting.BOLD),
        x,
        top + CONTENT_Y + 4,
        paired ? UiTheme.OK : UiTheme.WARN);
    graphics.drawString(
        font,
        Component.translatable("minemories.ui.server_is", serverHost()),
        x,
        top + CONTENT_Y + 18,
        COLOR_MUTED);
    if (!paired) return;
    if (quota == null) {
      graphics.drawString(font, storage.label(), x, top + CONTENT_Y + 32, COLOR_MUTED);
      return;
    }
    graphics.drawString(
        font,
        Component.translatable(
            "minemories.ui.space_used",
            StorageQuota.formatBytes(quota.usedBytes()),
            StorageQuota.formatBytes(quota.limitBytes())),
        x,
        top + CONTENT_Y + 32,
        COLOR_TEXT);
    int barWidth = panelWidth - 28;
    int filled = (int) (barWidth * Math.min(1.0, (double) quota.usedBytes() / quota.limitBytes()));
    int barY = top + CONTENT_Y + 45;
    graphics.fill(x, barY, x + barWidth, barY + 5, 0xFF1B1E1C);
    graphics.fill(
        x, barY, x + filled, barY + 5, filled > barWidth * 0.9 ? UiTheme.WARN : UiTheme.OK);
  }

  private String serverHost() {
    try {
      return java.net.URI.create(PairingClient.apiUrl()).getHost();
    } catch (RuntimeException error) {
      return ClientSettings.DEFAULT_API_URL;
    }
  }

  @Override
  public void onClose() {
    if (this.minecraft != null) this.minecraft.setScreen(parent);
  }
}
