package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Random;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class QuantizationTest {
  @TempDir Path temporary;

  private static final float[] UV = {0, 0, 1, 0, 1, 1, 0, 1};

  private record Glb(String json, ByteBuffer binary) {}

  private static Glb read(Path file) throws IOException {
    byte[] bytes = Files.readAllBytes(file);
    ByteBuffer all = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
    int length = all.getInt(12);
    return new Glb(
        new String(bytes, 20, length, StandardCharsets.UTF_8),
        ByteBuffer.wrap(bytes, 28 + length, bytes.length - 28 - length)
            .slice()
            .order(ByteOrder.LITTLE_ENDIAN));
  }

  @Test
  void gridPositionsAreExactAndRotatedOnesStayWithinOneTwoHundredFiftySixthOfABlock()
      throws IOException {
    Random random = new Random(7);
    float[] wanted = new float[12];
    for (int corner = 0; corner < 4; corner++) {
      wanted[corner * 3] = corner % 2 + 40 + 3 / 16f + random.nextFloat() * 0.01f;
      wanted[corner * 3 + 1] = -20 + corner / 2 * 9 / 16f;
      wanted[corner * 3 + 2] = 100.4375f;
    }
    GlbScene scene = new GlbScene();
    scene.addQuad("k", "k", "s", SpoolingGlbSceneTest.PNG, 0, 0, 0, 1, wanted, UV);
    Path file = temporary.resolve("q.glb");
    scene.write(file);
    Glb glb = read(file);
    assertTrue(glb.json().contains("\"extensionsRequired\":[\"KHR_mesh_quantization\"]"));
    var scale =
        java.util.regex.Pattern.compile(
                "\"translation\":\\[(-?\\d+),(-?\\d+),(-?\\d+)\\],\"scale\":\\[([0-9.E-]+)")
            .matcher(glb.json());
    assertTrue(scale.find());
    float factor = Float.parseFloat(scale.group(4));
    assertEquals(1 / 128f, factor);
    for (int corner = 0; corner < 4; corner++) {
      for (int axis = 0; axis < 3; axis++) {
        float decoded =
            glb.binary().getShort((corner * 4 + axis) * 2) * factor
                + Integer.parseInt(scale.group(axis + 1));
        assertEquals(wanted[corner * 3 + axis], decoded, 1 / 256f + 1e-6f);
      }
    }
    // The exact 1/16 grid values survive unchanged.
    float decoded = glb.binary().getShort(2 * 2) * factor + Integer.parseInt(scale.group(3));
    assertEquals(100.4375f, decoded);
  }

  @Test
  void uvsOutsideTheUnitSquareStayFloat32AndCoarseExtentsKeepFloatPositions() throws IOException {
    GlbScene scene = new GlbScene();
    scene.addQuad(
        "wrap",
        "wrap",
        "s",
        SpoolingGlbSceneTest.PNG,
        0,
        0,
        0,
        1,
        new float[] {0, 0, 0, 5000, 0, 0, 5000, 1, 0, 0, 1, 0},
        new float[] {0, 0, 2, 0, 2, 1, 0, 1});
    Path file = temporary.resolve("wide.glb");
    scene.write(file);
    String json = read(file).json();
    assertTrue(json.contains("\"componentType\":5126,\"count\":4,\"type\":\"VEC2\"}"));
    assertTrue(json.contains("\"componentType\":5126,\"count\":4,\"type\":\"VEC3\",\"min\""));
    assertFalse(json.contains("\"scale\":"));
  }

  @Test
  void planRejectsNonFiniteExtentsAndPicksTheFinestGridThatFits() {
    float[] low = {Float.NEGATIVE_INFINITY, 0, 0}, high = {1, 1, 1};
    assertNull(Quantization.plan(low, high));
    assertNull(Quantization.plan(new float[] {-2e9f, 0, 0}, new float[] {2e9f, 1, 1}));
    var near = Quantization.plan(new float[] {0, 0, 0}, new float[] {100, 10, 10});
    assertEquals(7, near.shift());
    var far = Quantization.plan(new float[] {0, 0, 0}, new float[] {1000, 10, 10});
    assertEquals(6, far.shift());
    assertEquals(500, far.x());
    assertNull(Quantization.plan(new float[] {0, 0, 0}, new float[] {5000, 1, 1}));
    assertTrue(Quantization.uvFits(0, 1));
    assertFalse(Quantization.uvFits(-0.01f, 0));
    assertFalse(Quantization.uvFits(0, 1.01f));
  }
}
