package dev.minemories.neoforge;

import java.io.IOException;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Client producer: never waits for the writer or advances copied data before queue admission. */
final class ProgressiveCapturePump {
  interface Pixels {
    String key();

    int width();

    int height();

    int[] readBand(int row, int rows) throws IOException;
  }

  interface Producer {
    boolean exhausted() throws IOException;

    CaptureElement.Snapshot next() throws IOException;

    Pixels pixels(String key) throws IOException;
  }

  private final Producer producer;
  private final QueuedGlbCapture writer;
  private final Instant started;
  private final String metadata;
  private final Set<String> copied = new HashSet<>();
  private CaptureTransfer pending;
  private boolean finished;
  private final CaptureTransfer.Output output;

  ProgressiveCapturePump(
      Producer producer, QueuedGlbCapture writer, Instant started, String metadata) {
    this.producer = producer;
    this.writer = writer;
    this.started = started;
    this.metadata = metadata;
    output =
        new CaptureTransfer.Output() {
          public boolean begin(String key, int width, int height) throws IOException {
            return writer.offerTexture(key, width, height);
          }

          public boolean rows(String key, int row, int[] data) throws IOException {
            return writer.offerRows(key, row, data);
          }

          public boolean end(String key) throws IOException {
            return writer.offerTextureEnd(key);
          }

          public boolean geometry(
              List<CaptureElement.Quad> quads, List<CaptureElement.Light> lights)
              throws IOException {
            return writer.offerGeometry(quads, lights);
          }
        };
  }

  boolean finished() {
    return finished;
  }

  void step(CaptureFrameBudget budget) throws IOException {
    while (!finished && !writer.done() && writer.ready() && budget.admit()) {
      if (pending == null) {
        if (producer.exhausted()) {
          finished = writer.finish(started, metadata);
          return;
        }
        var copiedElement = producer.next();
        if (copiedElement != null) pending = new CaptureTransfer(copiedElement, copied);
      } else {
        if (!pending.step(producer::pixels, output)) return;
        if (pending.done()) pending = null;
      }
    }
  }
}
