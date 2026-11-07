package dev.minemories.client;

import java.util.Objects;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.language.I18n;
import net.minecraft.network.chat.Component;

/**
 * A remote endpoint is not a world UUID: continuity across connections is an explicit local choice.
 */
final class TemporalWorldScreen extends Screen {
  private final Screen parent;
  private final String server;
  private EditBox namespace;
  private String status = I18n.get("minemories.ui.no_identifier_shared_with_server");
  private int left;
  private int top;
  private int panelWidth;

  TemporalWorldScreen(Screen parent) {
    super(Component.translatable("minemories.ui.remote_world_and_timeline"));
    this.parent = parent;
    server = currentServer();
  }

  private static String currentServer() {
    Minecraft mc = Minecraft.getInstance();
    var server = mc.getCurrentServer();
    return mc.getSingleplayerServer() == null && server != null ? server.ip : null;
  }

  @Override
  protected void init() {
    panelWidth = Math.min(390, width - 12);
    left = (width - panelWidth) / 2;
    top = Math.max(4, (height - 236) / 2);
    namespace =
        addRenderableWidget(
            new EditBox(
                font,
                left + 14,
                top + 118,
                panelWidth - 28,
                20,
                Component.translatable("minemories.ui.remote_world_identifier")));
    namespace.setMaxLength(36);
    namespace.setEditable(server != null);
    if (server != null) {
      try {
        namespace.setValue(PairingClient.remoteWorldNamespace(server));
      } catch (RuntimeException error) {
        status = ClientRuntime.pairingError(error);
      }
    } else status = I18n.get("minemories.ui.connect_to_server_singleplayer_auto");
    int half = (panelWidth - 34) / 2;
    Button generate =
        addRenderableWidget(
            Button.builder(
                    Component.translatable("minemories.ui.generate"),
                    ignored -> namespace.setValue(UUID.randomUUID().toString()))
                .bounds(left + 14, top + 144, half, 20)
                .build());
    Button clear =
        addRenderableWidget(
            Button.builder(
                    Component.translatable("minemories.ui.clear"),
                    ignored -> namespace.setValue(""))
                .bounds(left + 20 + half, top + 144, half, 20)
                .build());
    Button save =
        addRenderableWidget(
            Button.builder(Component.translatable("minemories.ui.save"), ignored -> save())
                .bounds(left + 14, top + 174, half, 20)
                .build());
    addRenderableWidget(
        Button.builder(Component.translatable("minemories.ui.back"), ignored -> onClose())
            .bounds(left + 20 + half, top + 174, half, 20)
            .build());
    generate.active = server != null;
    clear.active = server != null;
    save.active = server != null;
  }

  private void save() {
    if (server == null || !Objects.equals(server, currentServer())) {
      status = I18n.get("minemories.ui.connection_changed_reopen_screen");
      return;
    }
    try {
      PairingClient.configureRemoteWorld(server, namespace.getValue());
      status =
          namespace.getValue().isBlank()
              ? I18n.get("minemories.ui.saved_separate_series_per_connection")
              : I18n.get("minemories.ui.identifier_saved_for_world");
    } catch (RuntimeException error) {
      status = ClientRuntime.pairingError(error);
    }
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    UiTheme.panel(graphics, left, top, panelWidth, 236);
    graphics.drawString(font, title, left + 14, top + 12, UiTheme.TEXT);
    graphics.drawString(
        font,
        font.plainSubstrByWidth(
            server == null ? I18n.get("minemories.ui.no_remote_server") : server, panelWidth - 28),
        left + 14,
        top + 30,
        UiTheme.MUTED);
    var explanation =
        font.split(
            Component.literal(I18n.get("minemories.ui.remote_world_identifier_hint")),
            panelWidth - 28);
    for (int i = 0; i < Math.min(5, explanation.size()); i++)
      graphics.drawString(font, explanation.get(i), left + 14, top + 48 + i * 10, UiTheme.TEXT);
    graphics.drawString(
        font,
        I18n.get("minemories.ui.world_identifier_uuid_optional"),
        left + 14,
        top + 104,
        UiTheme.TEXT);
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    var lines = font.split(Component.literal(status), panelWidth - 28);
    for (int i = 0; i < Math.min(3, lines.size()); i++)
      graphics.drawString(font, lines.get(i), left + 14, top + 202 + i * 10, UiTheme.TEXT);
  }

  @Override
  public void onClose() {
    if (minecraft != null) minecraft.setScreen(parent);
  }
}
