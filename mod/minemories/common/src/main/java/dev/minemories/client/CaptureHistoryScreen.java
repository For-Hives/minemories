package dev.minemories.client;

import java.io.IOException;
import java.nio.file.Path;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.Tooltip;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

final class CaptureHistoryScreen extends Screen {
  private static final DateTimeFormatter DATE =
      DateTimeFormatter.ofPattern("dd/MM/yy HH:mm").withZone(ZoneId.systemDefault());
  private final Screen parent;
  private final CaptureHistoryView history = new CaptureHistoryView();
  private final List<Button> rows = new ArrayList<>();
  private Path directory;
  private Button send;
  private Button previous;
  private Button next;
  private Button refresh;
  private boolean paired;
  private boolean sending;
  private String status;
  private int panelWidth;
  private int left;
  private int top;

  CaptureHistoryScreen(Screen parent) {
    super(Component.literal("Captures locales"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    panelWidth = Math.min(390, width - 12);
    left = (width - panelWidth) / 2;
    top = Math.max(4, (height - 236) / 2);
    rows.clear();
    for (int i = 0; i < CaptureHistory.PAGE_SIZE; i++) {
      int index = i;
      rows.add(button("", 14, 62 + i * 22, panelWidth - 28, () -> history.select(index)));
    }
    int half = (panelWidth - 34) / 2;
    send = button("Envoyer cette capture", 14, 173, half, this::sendSelected);
    send.setTooltip(
        Tooltip.create(
            Component.literal("Envoie uniquement le souvenir sélectionné. Aucun nouvel export.")));
    button("Retour", 20 + half, 173, half, this::onClose);
    previous = button("‹", 14, 201, 36, () -> history.previous(this::fetch, minecraft::execute));
    previous.setTooltip(Tooltip.create(Component.literal("Captures plus récentes")));
    next =
        button("›", panelWidth - 50, 201, 36, () -> history.next(this::fetch, minecraft::execute));
    next.setTooltip(Tooltip.create(Component.literal("Captures plus anciennes")));
    refresh = button("Actualiser", 56, 201, panelWidth - 112, this::refresh);
    try {
      directory = PairingClient.exportDirectory();
      paired = PairingClient.isPaired();
      refresh();
    } catch (RuntimeException error) {
      status = "Dossier local indisponible. Vérifie les réglages avancés.";
    }
    updateButtons();
  }

  private Button button(String text, int x, int y, int width, Runnable action) {
    return addRenderableWidget(
        Button.builder(Component.literal(text), ignored -> action.run())
            .bounds(left + x, top + y, width, 20)
            .build());
  }

  private CompletableFuture<CaptureHistory.Page> fetch(String before) {
    Path folder = directory;
    return CompletableFuture.supplyAsync(
        () -> {
          try {
            return CaptureHistory.list(folder, before, CaptureHistory.PAGE_SIZE);
          } catch (IOException error) {
            throw new CompletionException(error);
          }
        });
  }

  private void refresh() {
    status = null;
    history.refresh(this::fetch, minecraft::execute);
  }

  private void sendSelected() {
    CaptureHistory.Entry selected = history.selected();
    if (selected == null || !paired || sending || PairingClient.isUploading()) return;
    sending = true;
    status = "Envoi de la capture sélectionnée…";
    updateButtons();
    try {
      PairingClient.uploadCapture(selected.file())
          .whenComplete(
              (message, error) ->
                  Minecraft.getInstance()
                      .execute(
                          () -> {
                            sending = false;
                            status =
                                error == null
                                    ? "Souvenir envoyé dans ta galerie privée."
                                    : ClientRuntime.pairingError(error);
                          }));
    } catch (RuntimeException error) {
      sending = false;
      status = ClientRuntime.pairingError(error);
    }
  }

  private void updateButtons() {
    if (send == null) return;
    var entries = history.page().entries();
    CaptureHistory.Entry selected = history.selected();
    boolean waiting = sending || PairingClient.isUploading();
    send.active = paired && selected != null && selected.readable() && !waiting;
    previous.active = !history.pending() && history.hasPrevious() && !waiting;
    next.active = !history.pending() && history.page().hasMore() && !waiting;
    refresh.active = directory != null && !history.pending() && !waiting;
    for (int i = 0; i < rows.size(); i++) {
      Button row = rows.get(i);
      row.visible = i < entries.size();
      row.active = !waiting;
      if (!row.visible) continue;
      CaptureHistory.Entry entry = entries.get(i);
      String prefix =
          (entry.equals(selected) ? "› " : "") + DATE.format(entry.capturedAt()) + " · ";
      String suffix = " · " + StorageQuota.formatBytes(entry.bytes());
      String world =
          font.plainSubstrByWidth(
              entry.world(), Math.max(12, panelWidth - 40 - font.width(prefix + suffix)));
      row.setMessage(Component.literal(prefix + world + suffix));
      row.setTooltip(Tooltip.create(Component.literal(entry.world() + "\n" + entry.file())));
    }
  }

  @Override
  public void tick() {
    super.tick();
    updateButtons();
  }

  @Override
  public void removed() {
    history.close();
    super.removed();
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    graphics.fill(left - 1, top - 1, left + panelWidth + 1, top + 237, 0xFF667063);
    graphics.fill(left, top, left + panelWidth, top + 236, 0xFF252926);
    graphics.drawString(font, title, left + 14, top + 14, 0xFFECE8DC);
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    String message = status == null ? history.message() : status;
    var lines = font.split(Component.literal(message), panelWidth - 28);
    for (int i = 0; i < Math.min(2, lines.size()); i++) {
      graphics.drawString(font, lines.get(i), left + 14, top + 34 + i * 10, 0xFFECE8DC);
    }
    String help =
        paired
            ? "Envoi uniquement avec le bouton ci-dessous."
            : "Connecte ta galerie via M pour envoyer une capture.";
    graphics.drawString(
        font, font.plainSubstrByWidth(help, panelWidth - 28), left + 14, top + 154, 0xFFB2B6AA);
  }

  @Override
  public void onClose() {
    if (minecraft != null) minecraft.setScreen(parent);
  }
}
