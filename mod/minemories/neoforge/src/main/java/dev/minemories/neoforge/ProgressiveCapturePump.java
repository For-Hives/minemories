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
  private CaptureElement.Snapshot pending;
  private List<String> images = List.of();
  private int imageIndex, quadIndex, lightIndex, row;
  private Pixels pixels;
  private boolean textureBegun, finished;

  ProgressiveCapturePump(
      Producer producer, QueuedGlbCapture writer, Instant started, String metadata) {
    this.producer = producer;
    this.writer = writer;
    this.started = started;
    this.metadata = metadata;
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
        pending = producer.next();
        if (pending == null) continue;
        if (pending.quads().isEmpty() && pending.lights().isEmpty()) {
          pending = null;
          continue;
        }
        images = pending.quads().stream().map(q -> q.material().image()).distinct().toList();
        imageIndex = quadIndex = lightIndex = 0;
      } else if (imageIndex < images.size()) {
        if (!copyTexture()) return;
      } else {
        int quads = Math.min(quadIndex + QueuedGlbCapture.MAX_BATCH_QUADS, pending.quads().size());
        int lights = Math.min(lightIndex + 128, pending.lights().size());
        if (!writer.offerGeometry(
            pending.quads().subList(quadIndex, quads),
            pending.lights().subList(lightIndex, lights))) return;
        quadIndex = quads;
        lightIndex = lights;
        if (quadIndex == pending.quads().size() && lightIndex == pending.lights().size())
          pending = null;
      }
    }
  }

  private boolean copyTexture() throws IOException {
    String key = images.get(imageIndex);
    if (copied.contains(key)) {
      imageIndex++;
      return true;
    }
    if (pixels == null) pixels = producer.pixels(key);
    if (!textureBegun) {
      if (!writer.offerTexture(key, pixels.width(), pixels.height())) return false;
      textureBegun = true;
    } else if (row < pixels.height()) {
      // Small bands reduce indivisible GPU/atlas work; a single very wide row remains bounded.
      int rows = Math.min(Math.max(1, 16384 / pixels.width()), pixels.height() - row);
      int[] band = pixels.readBand(row, rows);
      if (!writer.offerRows(key, row, band)) return false;
      row += rows;
    } else {
      if (!writer.offerTextureEnd(key)) return false;
      copied.add(key);
      imageIndex++;
      pixels = null;
      row = 0;
      textureBegun = false;
    }
    return true;
  }
}
