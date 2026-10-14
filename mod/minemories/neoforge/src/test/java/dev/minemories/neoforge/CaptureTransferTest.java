package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import org.junit.jupiter.api.Test;

class CaptureTransferTest {
  @Test
  void backpressureRetainsPixelsAndGeometryWithoutDuplicateReads() throws Exception {
    var element = new CaptureElement();
    for (int i = 0; i < 130; i++)
      element.addQuad(
          "key", "name", "image", new byte[0], 0xffffff, 0, 0, 1, new float[12], new float[8]);
    for (int i = 0; i < 129; i++) element.addPointLight(0, 0, 0, 0xffffff, 15);
    var completed = new HashSet<String>();
    var transfer = new CaptureTransfer(element.seal(), completed);
    int[] reads = {0};
    var source =
        new CapturePixels.Source() {
          public String key() {
            return "image";
          }

          public int width() {
            return 256;
          }

          public int height() {
            return 257;
          }

          public int[] readBand(int row, int rows) {
            reads[0]++;
            return new int[width() * rows];
          }
        };
    var output = new RejectOnceOutput();
    for (int i = 0; i < 100 && !transfer.done(); i++) transfer.step(key -> source, output);
    assertTrue(transfer.done());
    assertEquals(2, reads[0]);
    assertEquals(List.of(0, 256), output.rows);
    assertEquals(130, output.quads);
    assertEquals(129, output.lights);
    assertEquals(1, output.begins);
    assertEquals(1, output.ends);
    assertEquals(java.util.Set.of("image"), completed);
    var reused = new CaptureTransfer(elementSnapshot(), completed);
    assertFalse(
        reused.step(
            key -> {
              fail("Already transferred image");
              return null;
            },
            output));
    assertTrue(reused.step(key -> source, output));
    assertTrue(reused.done());
  }

  private static CaptureElement.Snapshot elementSnapshot() throws Exception {
    var element = new CaptureElement();
    element.addQuad(
        "key", "name", "image", new byte[0], 0xffffff, 0, 0, 1, new float[12], new float[8]);
    return element.seal();
  }

  @Test
  void emptyElementFinishesWithoutOutput() throws Exception {
    var transfer = new CaptureTransfer(new CaptureElement().seal(), new HashSet<>());
    assertTrue(transfer.done());
    assertTrue(transfer.step(null, null));
  }

  private static final class RejectOnceOutput implements CaptureTransfer.Output {
    private boolean reject = true;
    private int begins, ends, quads, lights;
    private final List<Integer> rows = new ArrayList<>();
    private int[] rejectedBand;

    private boolean accept() {
      boolean accepted = !reject;
      reject = !reject;
      return accepted;
    }

    public boolean begin(String key, int width, int height) {
      if (!accept()) return false;
      begins++;
      return true;
    }

    public boolean rows(String key, int row, int[] pixels) {
      if (!accept()) {
        rejectedBand = pixels;
        return false;
      }
      assertSame(rejectedBand, pixels);
      rows.add(row);
      return true;
    }

    public boolean end(String key) {
      if (!accept()) return false;
      ends++;
      return true;
    }

    public boolean geometry(List<CaptureElement.Quad> batch, List<CaptureElement.Light> points) {
      if (!accept()) return false;
      quads += batch.size();
      lights += points.size();
      return true;
    }
  }
}
