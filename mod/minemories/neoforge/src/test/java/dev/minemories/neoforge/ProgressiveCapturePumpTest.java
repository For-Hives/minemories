package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Arrays;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ProgressiveCapturePumpTest {
  @TempDir Path folder;

  @Test
  void perFrameAdmissionKeepsEveryQuadAndCopiesSharedTextureOnlyOnce() throws Exception {
    AtomicInteger produced = new AtomicInteger(), bands = new AtomicInteger();
    var element = new CaptureElement();
    for (int i = 0; i < 150; i++)
      element.addQuad(
          "key",
          "block",
          "image",
          new byte[0],
          0xffffff,
          0,
          0,
          1,
          new float[] {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0},
          new float[] {0, 0, 1, 0, 1, 1, 0, 1});
    var snapshot = element.seal();
    var producer =
        new ProgressiveCapturePump.Producer() {
          @Override
          public boolean exhausted() {
            return produced.get() == 3;
          }

          @Override
          public CaptureElement.Snapshot next() {
            produced.incrementAndGet();
            return snapshot;
          }

          @Override
          public ProgressiveCapturePump.Pixels pixels(String key) {
            return new ProgressiveCapturePump.Pixels() {
              @Override
              public String key() {
                return key;
              }

              @Override
              public int width() {
                return 256;
              }

              @Override
              public int height() {
                return 1024;
              }

              @Override
              public int[] readBand(int row, int rows) {
                assertTrue(rows * width() <= 16384);
                bands.incrementAndGet();
                int[] pixels = new int[rows * width()];
                Arrays.fill(pixels, -1);
                return pixels;
              }
            };
          }
        };
    try (var writer = new QueuedGlbCapture(folder)) {
      var pump = new ProgressiveCapturePump(producer, writer, Instant.now(), "{}");
      long timeout = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
      int frames = 0;
      while (!pump.finished() && !writer.done()) {
        assertTrue(System.nanoTime() < timeout);
        int before = produced.get();
        pump.step(new CaptureFrameBudget(() -> 0, 1, 1));
        assertTrue(produced.get() - before <= 1);
        frames++;
        Thread.yield();
      }
      var result = writer.completion().toCompletableFuture().get(10, TimeUnit.SECONDS);
      assertEquals(450, result.quads());
      assertEquals(1, result.textures());
      assertEquals(16, bands.get());
      assertTrue(frames > 20);
      assertEquals(3, produced.get());
      assertNotNull(CaptureHistory.metadata(result.file()).get("captureFinishedAt"));
    }
  }

  @Test
  void sourceFailureAndCancellationPreservePreviousCapture() throws Exception {
    Path previous =
        CaptureHistory.save(
            folder, Instant.now(), "{}", file -> java.nio.file.Files.writeString(file, "previous"));
    var element = new CaptureElement();
    element.addQuad(
        "key",
        "block",
        "missing",
        new byte[0],
        0xffffff,
        0,
        0,
        1,
        new float[] {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0},
        new float[] {0, 0, 1, 0, 1, 1, 0, 1});
    var producer =
        new ProgressiveCapturePump.Producer() {
          @Override
          public boolean exhausted() {
            return false;
          }

          @Override
          public CaptureElement.Snapshot next() {
            return element.seal();
          }

          @Override
          public ProgressiveCapturePump.Pixels pixels(String key) throws IOException {
            throw new IOException("resources replaced");
          }
        };
    try (var writer = new QueuedGlbCapture(folder)) {
      var pump = new ProgressiveCapturePump(producer, writer, Instant.now(), "{}");
      assertThrows(IOException.class, () -> pump.step(new CaptureFrameBudget(() -> 0, 1, 10)));
    }
    assertEquals(previous, CaptureHistory.latest(folder));
    assertEquals("previous", java.nio.file.Files.readString(previous));
  }
}
