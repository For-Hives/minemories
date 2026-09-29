package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class GlbSceneTest {
  private static final byte[] ONE_PIXEL_PNG =
      Base64.getDecoder()
          .decode(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/HxoAAAAASUVORK5CYII=");

  @TempDir Path tempDir;

  @Test
  void writesTexturedEmissiveGlbWithPunctualLight() throws IOException {
    GlbScene scene = new GlbScene();
    scene.addQuad(
        "torch",
        "torch",
        "minecraft:block/torch",
        ONE_PIXEL_PNG,
        0xFFF0D0,
        0,
        1,
        1,
        new float[] {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0},
        new float[] {0, 0, 1, 0, 1, 1, 0, 1});
    scene.addPointLight(0.5f, 0.5f, 0.5f, 0xFFF0D0, 14);

    Path output = tempDir.resolve("capture.glb");
    scene.write(output);

    byte[] glb = Files.readAllBytes(output);
    ByteBuffer header = ByteBuffer.wrap(glb).order(ByteOrder.LITTLE_ENDIAN);
    assertEquals(0x46546C67, header.getInt(0));
    assertEquals(2, header.getInt(4));
    assertEquals(glb.length, header.getInt(8));

    int jsonLength = header.getInt(12);
    String json = new String(glb, 20, jsonLength, StandardCharsets.UTF_8).trim();
    assertTrue(json.contains("\"emissiveTexture\":{\"index\":0}"));
    assertTrue(json.contains("KHR_lights_punctual"));
    assertFalse(json.contains("NaN"));
    assertFalse(json.contains("Infinity"));
  }

  @Test
  void ignoresQuadsWithNonFinitePositionsOrUvs() {
    GlbScene scene = new GlbScene();
    scene.addQuad(
        "invalid-position",
        "invalid",
        "sprite",
        ONE_PIXEL_PNG,
        0xFFFFFF,
        0,
        0,
        1,
        new float[] {Float.NaN, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0},
        new float[] {0, 0, 1, 0, 1, 1, 0, 1});
    scene.addQuad(
        "invalid-uv",
        "invalid",
        "sprite",
        ONE_PIXEL_PNG,
        0xFFFFFF,
        0,
        0,
        1,
        new float[] {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0},
        new float[] {0, 0, Float.POSITIVE_INFINITY, 0, 1, 1, 0, 1});

    assertEquals(0, scene.materialCount());
  }
}
