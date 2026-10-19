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
  private String status =
      I18n.get("minemories.ui.aucun_identifiant_partage_avec_un_serveur_minecraft");
  private int left;
  private int top;
  private int panelWidth;

  TemporalWorldScreen(Screen parent) {
    super(Component.translatable("minemories.ui.monde_distant_et_timelapse"));
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
                Component.translatable("minemories.ui.identifiant_de_ce_monde_distant")));
    namespace.setMaxLength(36);
    namespace.setEditable(server != null);
    if (server != null) {
      try {
        namespace.setValue(PairingClient.remoteWorldNamespace(server));
      } catch (RuntimeException error) {
        status = ClientRuntime.pairingError(error);
      }
    } else
      status =
          I18n.get(
              "minemories.ui.connecte_toi_a_un_serveur_les_mondes_solo_sont_identifies_automatiquement");
    int half = (panelWidth - 34) / 2;
    Button generate =
        addRenderableWidget(
            Button.builder(
                    Component.translatable("minemories.ui.generer"),
                    ignored -> namespace.setValue(UUID.randomUUID().toString()))
                .bounds(left + 14, top + 144, half, 20)
                .build());
    Button clear =
        addRenderableWidget(
            Button.builder(
                    Component.translatable("minemories.ui.effacer"),
                    ignored -> namespace.setValue(""))
                .bounds(left + 20 + half, top + 144, half, 20)
                .build());
    Button save =
        addRenderableWidget(
            Button.builder(Component.translatable("minemories.ui.enregistrer"), ignored -> save())
                .bounds(left + 14, top + 174, half, 20)
                .build());
    addRenderableWidget(
        Button.builder(Component.translatable("minemories.ui.retour"), ignored -> onClose())
            .bounds(left + 20 + half, top + 174, half, 20)
            .build());
    generate.active = server != null;
    clear.active = server != null;
    save.active = server != null;
  }

  private void save() {
    if (server == null || !Objects.equals(server, currentServer())) {
      status =
          I18n.get("minemories.ui.connexion_modifiee_rouvre_cet_ecran_depuis_le_monde_concerne");
      return;
    }
    try {
      PairingClient.configureRemoteWorld(server, namespace.getValue());
      status =
          namespace.getValue().isBlank()
              ? I18n.get("minemories.ui.enregistre_une_serie_distincte_par_connexion")
              : I18n.get(
                  "minemories.ui.identifiant_conserve_pour_ce_monde_change_le_si_sa_carte_est_remplacee");
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
        font.plainSubstrByWidth(
            server == null ? I18n.get("minemories.ui.aucun_serveur_distant") : server,
            panelWidth - 28),
        left + 14,
        top + 30,
        0xFFB2B6AA);
    var explanation =
        font.split(
            Component.literal(
                I18n.get(
                    "minemories.ui.sans_identifiant_chaque_connexion_reste_separee_pour_retrouver_la_meme_serie_apres_reconnexion_conserve_lidentifiant_de_ce_monde_change_le_si_la_carte_du_serveur_est_remplacee")),
            panelWidth - 28);
    for (int i = 0; i < Math.min(5, explanation.size()); i++)
      graphics.drawString(font, explanation.get(i), left + 14, top + 48 + i * 10, 0xFFE3E9DD);
    graphics.drawString(
        font,
        I18n.get("minemories.ui.identifiant_du_monde_uuid_facultatif"),
        left + 14,
        top + 104,
        0xFFE3E9DD);
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
