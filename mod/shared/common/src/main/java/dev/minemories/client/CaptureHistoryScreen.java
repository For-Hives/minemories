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
import net.minecraft.client.resources.language.I18n;
import net.minecraft.network.chat.Component;

final class CaptureHistoryScreen extends Screen {
  private static final DateTimeFormatter DATE =
      DateTimeFormatter.ofPattern("dd/MM/yy HH:mm").withZone(ZoneId.systemDefault());
  private static final int LIST_TOP = 58;
  private static final int LINE_HEIGHT = 20;
  private static final int SEND_WIDTH = 44;
  private final Screen parent;
  private final CaptureListView view = new CaptureListView();
  private final UploadBatch batch = new UploadBatch();
  private final List<Button> rows = new ArrayList<>();
  private Path directory;
  private Button sendAll;
  private Button previous;
  private Button next;
  private boolean paired;
  private boolean closed;
  private String status;
  private int panelWidth;
  private int left;
  private int top;

  CaptureHistoryScreen(Screen parent) {
    super(Component.translatable("minemories.ui.local_captures"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    panelWidth = Math.min(390, width - 12);
    left = (width - panelWidth) / 2;
    top = Math.max(4, (height - 236) / 2);
    rows.clear();
    for (int i = 0; i < CaptureListView.LINES; i++) {
      int index = i;
      Button row =
          button(
              I18n.get("minemories.ui.upload_row"),
              panelWidth - 14 - SEND_WIDTH,
              LIST_TOP + i * LINE_HEIGHT,
              SEND_WIDTH,
              () -> sendRow(index));
      row.setTooltip(Tooltip.create(Component.translatable("minemories.ui.upload_row_hint")));
      rows.add(row);
    }
    previous = button("‹", 14, 182, 36, () -> view.previous());
    previous.setTooltip(Tooltip.create(Component.translatable("minemories.ui.newer_captures")));
    next = button("›", panelWidth - 50, 182, 36, () -> view.next());
    next.setTooltip(Tooltip.create(Component.translatable("minemories.ui.older_captures")));
    int half = (panelWidth - 34) / 2;
    sendAll = button("", 14, 208, half, this::sendAll);
    sendAll.setTooltip(Tooltip.create(Component.translatable("minemories.ui.upload_all_hint")));
    button(I18n.get("minemories.ui.back"), 20 + half, 208, half, this::onClose);
    try {
      directory = PairingClient.exportDirectory();
      paired = PairingClient.isPaired();
      reload();
    } catch (RuntimeException error) {
      status = I18n.get("minemories.ui.local_folder_unavailable");
    }
    updateButtons();
  }

  private Button button(String text, int x, int y, int width, Runnable action) {
    return addRenderableWidget(
        Button.builder(Component.literal(text), ignored -> action.run())
            .bounds(left + x, top + y, width, 20)
            .build());
  }

  private void reload() {
    Path folder = directory;
    view.refresh(
        () ->
            CompletableFuture.supplyAsync(
                () -> {
                  try {
                    return CaptureHistory.listAll(folder);
                  } catch (IOException error) {
                    throw new CompletionException(error);
                  }
                }),
        minecraft::execute);
  }

  private boolean busy() {
    return batch.running() || PairingClient.isUploading();
  }

  private void sendRow(int slot) {
    var lines = view.lines();
    if (slot >= lines.size() || lines.get(slot).entry() == null) return;
    start(List.of(lines.get(slot).entry()));
  }

  private void sendAll() {
    start(view.unsent());
  }

  private void start(List<CaptureHistory.Entry> captures) {
    if (!paired || busy() || view.pending()) return;
    if (!batch.start(captures)) {
      status = I18n.get("minemories.ui.nothing_to_send");
      return;
    }
    status = null;
    pump();
  }

  /** Sends the next capture of the run, one at a time; called again when each one finishes. */
  private void pump() {
    if (!batch.running() || batch.inFlight() || PairingClient.isUploading()) return;
    CaptureHistory.Entry entry = batch.next();
    if (entry == null) {
      finishBatch();
      return;
    }
    try {
      PairingClient.uploadCapture(entry.file())
          .whenComplete(
              (message, error) -> Minecraft.getInstance().execute(() -> uploaded(entry, error)));
    } catch (RuntimeException error) {
      uploaded(entry, error);
    }
  }

  private void uploaded(CaptureHistory.Entry entry, Throwable error) {
    if (error == null) {
      batch.succeeded();
      view.markUploaded(entry.id());
    } else {
      batch.failed(ChunkedUploader.classify(error));
    }
    if (closed) return;
    if (batch.running()) pump();
    else finishBatch();
  }

  private void finishBatch() {
    UploadFailure stop = batch.stoppedBy();
    if (stop == null) {
      status =
          batch.failed() == 0
              ? I18n.get("minemories.ui.batch_done", batch.sent())
              : I18n.get(
                  "minemories.ui.batch_done_with_failures",
                  batch.sent(),
                  batch.failed(),
                  batch.lastError());
    } else if (stop.kind() == UploadFailure.Kind.RATE_LIMITED) {
      status =
          I18n.get(
              "minemories.ui.batch_rate_limited",
              batch.sent(),
              batch.skipped(),
              delay(stop.retryAfterSeconds()));
    } else {
      status =
          I18n.get("minemories.ui.batch_stopped", batch.sent(), batch.skipped(), stop.message());
    }
    if (!closed && directory != null) reload();
  }

  private static String delay(long seconds) {
    return seconds < 120 ? seconds + " s" : (seconds + 59) / 60 + " min";
  }

  private String message() {
    if (status != null && !batch.running()) return status;
    if (batch.running()) {
      return I18n.get("minemories.ui.batch_progress", batch.position(), batch.total());
    }
    if (view.pending()) return I18n.get("minemories.ui.loading_captures");
    if (view.failed()) return I18n.get("minemories.ui.history_unavailable");
    if (view.empty()) return I18n.get("minemories.ui.no_captures");
    if (!paired) return I18n.get("minemories.ui.connect_gallery_with_m_to_send");
    int waiting = view.unsent().size();
    return waiting == 0
        ? I18n.get("minemories.ui.all_sent")
        : I18n.get("minemories.ui.waiting_to_send", waiting);
  }

  private void updateButtons() {
    if (sendAll == null) return;
    boolean waiting = busy();
    var lines = view.lines();
    int unsent = view.unsent().size();
    sendAll.setMessage(Component.literal(I18n.get("minemories.ui.upload_all", unsent)));
    sendAll.active = paired && unsent > 0 && !waiting && !view.pending();
    previous.active = view.hasPrevious();
    next.active = view.hasNext();
    for (int i = 0; i < rows.size(); i++) {
      Button row = rows.get(i);
      CaptureHistory.Entry entry = i < lines.size() ? lines.get(i).entry() : null;
      row.visible = entry != null && entry.readable() && !entry.uploaded();
      row.active = paired && !waiting && !view.pending();
    }
  }

  @Override
  public void tick() {
    super.tick();
    pump();
    updateButtons();
  }

  @Override
  public void removed() {
    closed = true;
    batch.cancel();
    view.close();
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
    var lines = font.split(Component.literal(message()), panelWidth - 28);
    for (int i = 0; i < Math.min(2, lines.size()); i++) {
      graphics.drawString(font, lines.get(i), left + 14, top + 30 + i * 10, 0xFFECE8DC);
    }
    var list = view.lines();
    for (int i = 0; i < list.size(); i++) {
      drawLine(graphics, list.get(i), top + LIST_TOP + i * LINE_HEIGHT + 6);
    }
    String pageText = (view.page() + 1) + " / " + view.pageCount();
    graphics.drawString(
        font, pageText, left + (panelWidth - font.width(pageText)) / 2, top + 188, 0xFFB2B6AA);
  }

  private void drawLine(GuiGraphics graphics, CaptureGroups.Line line, int y) {
    int right = left + panelWidth - 14;
    if (line.header()) {
      var group = line.group();
      String count = " · " + group.entries().size();
      String name = group.unknown() ? I18n.get("minemories.ui.group_unknown") : group.label();
      String shown = font.plainSubstrByWidth(name, panelWidth - 28 - font.width(count));
      graphics.drawString(
          font, shown + count, left + 14, y, group.server() ? 0xFF9CC4E4 : 0xFFA9D18E);
      return;
    }
    CaptureHistory.Entry entry = line.entry();
    String text = DATE.format(entry.capturedAt()) + " · " + StorageQuota.formatBytes(entry.bytes());
    graphics.drawString(font, text, left + 22, y, 0xFFECE8DC);
    String mark = null;
    int color = 0xFFB2B6AA;
    if (!entry.readable()) {
      mark = I18n.get("minemories.ui.unreadable");
      color = 0xFFE07A6E;
    } else if (entry.uploaded()) {
      mark = "✓ " + I18n.get("minemories.ui.history_sent");
      color = 0xFF7FD68A;
    }
    if (mark != null) graphics.drawString(font, mark, right - font.width(mark), y, color);
  }

  @Override
  public void onClose() {
    if (minecraft != null) minecraft.setScreen(parent);
  }
}
