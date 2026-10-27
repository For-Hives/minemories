package dev.minemories.client;

import java.util.List;
import net.minecraft.ChatFormatting;
import net.minecraft.Util;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

final class SimpleHubScreen extends Screen {
  private static final int COLOR_PANEL = 0xFF252926;
  private static final int COLOR_BORDER = 0xFF667063;
  private static final int COLOR_CARD = 0xFF30352F;
  private static final int COLOR_TEXT = 0xFFECE8DC;
  private static final int COLOR_MUTED = 0xFFB2B6AA;
  private static final int COLOR_CONNECTED = 0xFF8FD694;
  private static final int COLOR_WAITING = 0xFFE8B84A;
  private static final int ACTIONS_HEIGHT = 58;
  private final Screen parent;
  private SimpleHubModel.Input input;
  private SimpleHubModel.Actions actions;
  private EditBox codeInput;
  private Button connectButton;
  private Button codeHelpButton;
  private IconButton takeButton;
  private IconButton autoButton;
  private IconButton memoriesButton;
  private String typedCode = "";
  private Component result;
  private boolean busy;
  private int panelWidth;
  private int panelHeight;
  private int footerY;
  private int left;
  private int top;

  SimpleHubScreen(Screen parent) {
    super(Component.translatable("minemories.hub.title"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    super.init();
    codeInput = null;
    connectButton = null;
    codeHelpButton = null;
    input = liveInput();
    actions = SimpleHubModel.actions(input);
    panelWidth = Math.min(300, width - 16);
    int actionsY = actions.showCodeField() ? 134 : 96;
    footerY = actionsY + ACTIONS_HEIGHT + 6;
    panelHeight = footerY + 26;
    left = (width - panelWidth) / 2;
    top = Math.max(4, (height - panelHeight) / 2);
    initHeader();
    if (actions.showCodeField()) initCode();
    initActions(actionsY);
    applyActions();
  }

  private void initHeader() {
    IconButton settings =
        addRenderableWidget(
            new IconButton(
                left + panelWidth - 86,
                top + 8,
                78,
                20,
                new ItemStack(Items.COMPARATOR),
                Component.translatable("minemories.hub.settings"),
                ignored -> Minecraft.getInstance().setScreen(new AdvancedScreen(this)),
                false));
    settings.setTooltip(Tooltip.create(Component.translatable("minemories.hub.settings_tooltip")));
  }

  private void initCode() {
    codeInput =
        addRenderableWidget(
            new EditBox(
                font,
                left + 14,
                top + 96,
                panelWidth - 110,
                20,
                Component.translatable("minemories.hub.code_hint")));
    codeInput.setMaxLength(6);
    codeInput.setFilter(value -> value.matches("\\d{0,6}"));
    codeInput.setHint(Component.translatable("minemories.hub.code_hint"));
    codeInput.setValue(typedCode);
    codeInput.setResponder(value -> typedCode = value);
    connectButton =
        addRenderableWidget(
            Button.builder(Component.translatable("minemories.hub.connect"), ignored -> pair())
                .bounds(left + panelWidth - 90, top + 96, 76, 20)
                .build());
    if (actions.showCodeHelp()) {
      codeHelpButton =
          addRenderableWidget(
              Button.builder(
                      Component.translatable("minemories.hub.code_help"), ignored -> openGallery())
                  .bounds(left + 14, top + 118, 150, 12)
                  .build());
      codeHelpButton.setTooltip(
          Tooltip.create(Component.translatable("minemories.hub.code_help_tooltip")));
    }
  }

  private void initActions(int y) {
    int slot = (panelWidth - 36) / 3;
    takeButton =
        addRenderableWidget(
            new IconButton(
                left + 14,
                top + y,
                slot,
                ACTIONS_HEIGHT,
                new ItemStack(Items.SPYGLASS),
                Component.translatable("minemories.hub.take"),
                ignored -> takeMemory(),
                true));
    takeButton.setTooltip(Tooltip.create(Component.translatable("minemories.hub.take_tooltip")));
    autoButton =
        addRenderableWidget(
            new IconButton(
                left + 18 + slot,
                top + y,
                slot,
                ACTIONS_HEIGHT,
                new ItemStack(Items.CLOCK),
                Component.translatable(SimpleHubModel.autoLabelKey(input)),
                ignored -> toggleAuto(),
                true));
    autoButton.setTooltip(Tooltip.create(Component.translatable("minemories.hub.auto_tooltip")));
    memoriesButton =
        addRenderableWidget(
            new IconButton(
                left + 22 + 2 * slot,
                top + y,
                slot,
                ACTIONS_HEIGHT,
                new ItemStack(Items.CHEST),
                Component.translatable("minemories.hub.memories"),
                ignored -> Minecraft.getInstance().setScreen(new CaptureHistoryScreen(this)),
                true));
    memoriesButton.setTooltip(
        Tooltip.create(Component.translatable("minemories.hub.memories_tooltip")));
  }

  private SimpleHubModel.Input liveInput() {
    Minecraft mc = Minecraft.getInstance();
    return new SimpleHubModel.Input(
        PairingClient.isPaired(),
        mc.level != null,
        busy || PairingClient.isUploading(),
        PairingClient.isAfkSnapshots(),
        typedCode.length(),
        ClientSettings.DEFAULT_API_URL.equals(PairingClient.apiUrl()));
  }

  private void applyActions() {
    if (codeInput != null) codeInput.setEditable(!input.busy());
    if (connectButton != null) connectButton.active = actions.connectEnabled();
    takeButton.active = actions.captureEnabled();
    autoButton.active = actions.autoEnabled();
    autoButton.setMessage(Component.translatable(SimpleHubModel.autoLabelKey(input)));
    memoriesButton.active = actions.memoriesEnabled();
  }

  @Override
  public void tick() {
    super.tick();
    input = liveInput();
    actions = SimpleHubModel.actions(input);
    if (actions.showCodeField() != (codeInput != null)
        || actions.showCodeHelp() != (codeHelpButton != null)) {
      rebuildWidgets();
    } else {
      applyActions();
    }
  }

  private void pair() {
    busy = true;
    result = null;
    try {
      PairingClient.pair(typedCode)
          .whenComplete(
              (message, failure) -> Minecraft.getInstance().execute(() -> finishPair(failure)));
    } catch (RuntimeException error) {
      busy = false;
      result = Component.literal(ClientRuntime.pairingError(error));
    }
  }

  private void finishPair(Throwable failure) {
    busy = false;
    if (failure == null) {
      typedCode = "";
      result = null;
    } else {
      result = Component.literal(ClientRuntime.pairingError(failure));
    }
    if (minecraft != null && minecraft.screen == this) rebuildWidgets();
  }

  private void takeMemory() {
    busy = true;
    result = null;
    try {
      if (ClientRuntime.export(PairingClient.afkOptions().radius()) != 1) {
        finish("minemories.hub.failed");
      } else if (!PairingClient.isPaired()) {
        finish("minemories.hub.saved_local");
      } else {
        PairingClient.uploadCapture(ClientRuntime.latestCapturePath())
            .whenComplete(
                (message, failure) ->
                    Minecraft.getInstance()
                        .execute(
                            () ->
                                finish(
                                    failure == null
                                        ? "minemories.hub.sent"
                                        : "minemories.hub.failed")));
      }
    } catch (RuntimeException error) {
      finish("minemories.hub.failed");
    }
  }

  private void finish(String key) {
    busy = false;
    result = Component.translatable(key);
  }

  private void toggleAuto() {
    result = null;
    try {
      PairingClient.setAfkSnapshots(!PairingClient.isAfkSnapshots());
    } catch (RuntimeException error) {
      result = Component.literal(ClientRuntime.pairingError(error));
    }
  }

  private void openGallery() {
    Util.getPlatform().openUri(ClientSettings.DEFAULT_SITE_URL + "/gallery");
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    graphics.fill(left - 1, top - 1, left + panelWidth + 1, top + panelHeight + 1, COLOR_BORDER);
    graphics.fill(left, top, left + panelWidth, top + panelHeight, COLOR_PANEL);
    graphics.fill(left + 10, top + 34, left + panelWidth - 10, top + 88, COLOR_CARD);
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    graphics.renderItem(new ItemStack(Items.FILLED_MAP), left + 14, top + 8);
    drawLines(
        graphics,
        Component.translatable("minemories.hub.title").withStyle(ChatFormatting.BOLD),
        left + 36,
        top + 14,
        panelWidth - 160,
        1,
        COLOR_TEXT);
    boolean paired = input.paired();
    IconButton.drawScaled(
        graphics, new ItemStack(paired ? Items.EMERALD : Items.BARRIER), left + 18, top + 42);
    drawLines(
        graphics,
        Component.translatable(SimpleHubModel.statusTitleKey(input)).withStyle(ChatFormatting.BOLD),
        left + 62,
        top + 40,
        panelWidth - 70,
        1,
        paired ? COLOR_CONNECTED : COLOR_WAITING);
    drawLines(
        graphics,
        Component.translatable(SimpleHubModel.statusHintKey(input)),
        left + 62,
        top + 52,
        panelWidth - 70,
        3,
        COLOR_MUTED);
    drawLines(
        graphics,
        footer(),
        left + 14,
        top + footerY,
        panelWidth - 28,
        2,
        result == null ? COLOR_MUTED : COLOR_TEXT);
  }

  private Component footer() {
    if (result != null) return result;
    String capture = ClientRuntime.afkCaptureStatus();
    if (!capture.isEmpty()) return Component.literal(capture);
    return Component.translatable(SimpleHubModel.footerKey(input));
  }

  private void drawLines(
      GuiGraphics graphics, Component text, int x, int y, int maxWidth, int maxLines, int color) {
    List<FormattedCharSequence> lines = font.split(text, maxWidth);
    for (int i = 0; i < Math.min(maxLines, lines.size()); i++) {
      graphics.drawString(font, lines.get(i), x, y + i * 10, color);
    }
  }

  @Override
  public void onClose() {
    if (minecraft != null) minecraft.setScreen(parent);
  }
}
