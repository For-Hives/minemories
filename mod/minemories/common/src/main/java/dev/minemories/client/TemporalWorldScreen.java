package dev.minemories.client;

import java.util.Objects;
import java.util.UUID;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * A remote endpoint is not a world UUID: continuity across connections is an explicit local choice.
 */
final class TemporalWorldScreen extends Screen {
  private final Screen parent;
  private final String server;
  private EditBox namespace;
  private String status = "Aucun identifiant partagé avec un serveur Minecraft.";
  private int left;
  private int top;
  private int panelWidth;

  TemporalWorldScreen(Screen parent) {
    super(Component.literal("Monde distant et timelapse"));
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
                Component.literal("Identifiant de ce monde distant")));
    namespace.setMaxLength(36);
    namespace.setEditable(server != null);
    if (server != null) {
      try {
        namespace.setValue(PairingClient.remoteWorldNamespace(server));
      } catch (RuntimeException error) {
        status = ClientRuntime.pairingError(error);
      }
    } else status = "Connecte-toi à un serveur. Les mondes solo sont identifiés automatiquement.";
    int half = (panelWidth - 34) / 2;
    Button generate =
        addRenderableWidget(
            Button.builder(
                    Component.literal("Générer"),
                    ignored -> namespace.setValue(UUID.randomUUID().toString()))
                .bounds(left + 14, top + 144, half, 20)
                .build());
    Button clear =
        addRenderableWidget(
            Button.builder(Component.literal("Effacer"), ignored -> namespace.setValue(""))
                .bounds(left + 20 + half, top + 144, half, 20)
                .build());
    Button save =
        addRenderableWidget(
            Button.builder(Component.literal("Enregistrer"), ignored -> save())
                .bounds(left + 14, top + 174, half, 20)
                .build());
    addRenderableWidget(
        Button.builder(Component.literal("Retour"), ignored -> onClose())
            .bounds(left + 20 + half, top + 174, half, 20)
            .build());
    generate.active = server != null;
    clear.active = server != null;
    save.active = server != null;
  }

  private void save() {
    if (server == null || !Objects.equals(server, currentServer())) {
      status = "Connexion modifiée. Rouvre cet écran depuis le monde concerné.";
      return;
    }
    try {
      PairingClient.configureRemoteWorld(server, namespace.getValue());
      status =
          namespace.getValue().isBlank()
              ? "Enregistré : une série distincte par connexion."
              : "Identifiant conservé pour ce monde. Change-le si sa carte est remplacée.";
    } catch (RuntimeException error) {
      status = ClientRuntime.pairingError(error);
    }
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    graphics.fill(left, top, left + panelWidth, top + 236, 0xFF182019);
    graphics.drawString(font, title, left + 14, top + 12, 0xFFE3E9DD);
    graphics.drawString(
        font,
        font.plainSubstrByWidth(server == null ? "Aucun serveur distant" : server, panelWidth - 28),
        left + 14,
        top + 30,
        0xFFB2B6AA);
    var explanation =
        font.split(
            Component.literal(
                "Sans identifiant, chaque connexion reste séparée. Pour retrouver la même série après reconnexion, conserve l’identifiant de ce monde. Change-le si la carte du serveur est remplacée."),
            panelWidth - 28);
    for (int i = 0; i < Math.min(5, explanation.size()); i++)
      graphics.drawString(font, explanation.get(i), left + 14, top + 48 + i * 10, 0xFFE3E9DD);
    graphics.drawString(
        font, "Identifiant du monde (UUID, facultatif)", left + 14, top + 104, 0xFFE3E9DD);
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    var lines = font.split(Component.literal(status), panelWidth - 28);
    for (int i = 0; i < Math.min(3, lines.size()); i++)
      graphics.drawString(font, lines.get(i), left + 14, top + 202 + i * 10, 0xFFE3E9DD);
  }

  @Override
  public void onClose() {
    if (minecraft != null) minecraft.setScreen(parent);
  }
}
