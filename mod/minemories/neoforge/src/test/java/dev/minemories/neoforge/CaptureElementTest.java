package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import org.junit.jupiter.api.Test;

class CaptureElementTest {
  private static final float[] POSITIONS = {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0};
  private static final float[] UV = {0, 0, 1, 0, 1, 1, 0, 1};

  @Test
  void rendererArraysCannotChangeCopiedGeometryAndSnapshotsAreImmutable() throws Exception {
    var capture = new CaptureElement();
    float[] xyz = POSITIONS.clone(), uv = UV.clone();
    capture.addRenderedQuad("collar", "collar", "wolf", new byte[0], 0xff0000, 1, 0, 1, xyz, uv, 1);
    xyz[0] = 999;
    uv[0] = 999;
    var snapshot = capture.seal();
    var quad = snapshot.quads().getFirst();
    assertArrayEquals(POSITIONS, quad.positions());
    assertArrayEquals(UV, quad.uvs());
    assertEquals(1, quad.layer());
    float[] exposed = quad.positions();
    exposed[0] = 999;
    assertArrayEquals(POSITIONS, quad.positions());
    assertThrows(UnsupportedOperationException.class, () -> snapshot.quads().clear());
    assertThrows(IllegalStateException.class, capture::seal);
    assertThrows(IllegalStateException.class, () -> add(capture));
  }

  @Test
  void dropsInvalidDataBeforeAdmissionAndKeepsTheFirstMaterialDescriptor() throws Exception {
    var capture = new CaptureElement();
    float[] invalid = POSITIONS.clone();
    invalid[0] = Float.NaN;
    capture.addQuad("bad", "bad", "bad", new byte[0], 0, 0, 0, 1, invalid, UV);
    invalid = UV.clone();
    invalid[0] = Float.POSITIVE_INFINITY;
    capture.addQuad("bad", "bad", "bad", new byte[0], 0, 0, 0, 1, POSITIONS, invalid);
    capture.addPointLight(Float.NaN, 0, 0, 0, 15);
    capture.addPointLight(0, 0, 0, 0, 3);
    assertFalse(capture.hasGeometry());
    assertEquals(0, capture.materialCount());
    add(capture);
    capture.addQuad("key", "ignored", "other", new byte[0], 0, 0, 1, 1, POSITIONS, UV);
    capture.addPointLight(1, 2, 3, 0xff0000, 15);
    var snapshot = capture.seal();
    assertEquals(2, snapshot.quads().size());
    assertEquals("name", snapshot.quads().getLast().material().name());
    assertSame(snapshot.quads().getFirst().material(), snapshot.quads().getLast().material());
    assertEquals(1, snapshot.lights().size());
  }

  @Test
  void refusesAnOversizedModelInsteadOfPublishingAFormerPartialElement() throws Exception {
    var capture = new CaptureElement();
    int accepted = 0;
    try {
      while (accepted < 9000) {
        add(capture);
        accepted++;
      }
      fail("The collector must be bounded independently of renderer size");
    } catch (IOException expected) {
      assertTrue(accepted > 0 && accepted < 8192);
    }
    assertFalse(capture.hasGeometry());
    assertThrows(IllegalStateException.class, capture::seal);
    var tooLong = new CaptureElement();
    assertThrows(
        IOException.class,
        () ->
            tooLong.addQuad(
                "é".repeat(4096), "name", "image", new byte[0], 0, 0, 0, 1, POSITIONS, UV));
    assertThrows(IllegalStateException.class, tooLong::seal);
  }

  private static void add(CaptureElement capture) throws IOException {
    capture.addQuad("key", "name", "image", new byte[0], 0xffffff, 0, 0, 1, POSITIONS, UV);
  }
}
