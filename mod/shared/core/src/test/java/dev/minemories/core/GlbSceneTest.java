package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
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
    assertTrue(scene.hasGeometry());

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
    assertFalse(scene.hasGeometry());
  }

  @Test
  void emptyAndLightOnlyScenesCannotReplaceAnExistingCapture() throws IOException {
    Path output = tempDir.resolve("capture.glb");
    byte[] previous = new byte[] {1, 2, 3, 4};
    Files.write(output, previous);
    GlbScene scene = new GlbScene();
    assertThrows(IOException.class, () -> scene.write(output));
    org.junit.jupiter.api.Assertions.assertArrayEquals(previous, Files.readAllBytes(output));
    scene.addPointLight(0.5f, 1, 0.5f, 0xFFFFFF, 15);
    assertFalse(scene.hasGeometry());
    assertThrows(IOException.class, () -> scene.write(output));
    org.junit.jupiter.api.Assertions.assertArrayEquals(previous, Files.readAllBytes(output));
    Path missing = tempDir.resolve("not-created/capture.glb");
    assertThrows(IOException.class, () -> scene.write(missing));
    assertFalse(Files.exists(tempDir.resolve("not-created")));
  }

  @Test
  void rejectsWrongVertexCountsBeforeWritingAnything() {
    GlbScene scene = new GlbScene();
    assertThrows(
        IllegalArgumentException.class,
        () ->
            scene.addQuad(
                "short", "name", "sprite", ONE_PIXEL_PNG, 0, 0, 0, 1, new float[11], new float[8]));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            scene.addQuad(
                "uv", "name", "sprite", ONE_PIXEL_PNG, 0, 0, 0, 1, new float[12], new float[7]));
    assertEquals(0, scene.materialCount());
  }

  @Test
  void writesFiniteNormalsAndEscapedNamesForExtremeFiniteVertices() throws IOException {
    GlbScene scene = new GlbScene();
    scene.addQuad(
        "extreme",
        "line\n\"\\",
        "sprite\tname",
        ONE_PIXEL_PNG,
        0xFFFFFF,
        2,
        Float.NaN,
        Float.POSITIVE_INFINITY,
        new float[] {
          -Float.MAX_VALUE,
          0,
          0,
          Float.MAX_VALUE,
          0,
          0,
          Float.MAX_VALUE,
          Float.MAX_VALUE,
          0,
          -Float.MAX_VALUE,
          Float.MAX_VALUE,
          0
        },
        new float[] {0, 0, 1, 0, 1, 1, 0, 1});
    Path output = tempDir.resolve("nested/capture.glb");
    scene.write(output);
    byte[] glb = Files.readAllBytes(output);
    ByteBuffer header = ByteBuffer.wrap(glb).order(ByteOrder.LITTLE_ENDIAN);
    String json = new String(glb, 20, header.getInt(12), StandardCharsets.UTF_8).trim();
    assertTrue(json.contains("line\\u000a\\\"\\\\"));
    assertTrue(json.contains("sprite\\u0009name"));
    assertTrue(json.contains("\"alphaMode\":\"BLEND\""));
    assertFalse(json.contains("NaN"));
    assertFalse(json.contains("Infinity"));
    // JSON bounds can be finite while the binary NORMAL accessor contains NaN.
    assertTrue(json.contains("\"NORMAL\":1"));
    // The extent needs float32 positions, but normals are always normalized 8-bit.
    assertTrue(json.contains("\"byteOffset\":48,\"byteLength\":16,\"byteStride\":4"));
    int binaryStart = 20 + header.getInt(12) + 8;
    for (int vertex = 0; vertex < 4; vertex++) {
      int normal = binaryStart + 48 + vertex * 4;
      assertEquals(0, glb[normal]);
      assertEquals(0, glb[normal + 1]);
      assertEquals(127, glb[normal + 2]);
    }
  }

  @Test
  void convertsSrgbChannelsWithBothBranchesOfTheCurve() {
    assertEquals(0f, GlbColor.srgbToLinear(0));
    assertEquals(1f, GlbColor.srgbToLinear(255));
    // Linear segment (channel / 255 <= 0.04045).
    assertEquals(10 / 255.0 / 12.92, GlbColor.srgbToLinear(10), 1e-7);
    // Power segment.
    assertEquals(0.2158605, GlbColor.srgbToLinear(128), 1e-6);
    // Only the low byte is read, so ARGB and shifted colours need no masking.
    assertEquals(GlbColor.srgbToLinear(0x61), GlbColor.srgbToLinear(0xFF619961 >>> 16));
    float[] rgb = GlbColor.linearRgb(0xFFA4C954);
    assertEquals(0.371, rgb[0], 1e-3);
    assertEquals(0.584, rgb[1], 1e-3);
    assertEquals(0.089, rgb[2], 1e-3);
  }

  @Test
  void writesLinearMaterialAndLightColoursAndKeepsOpacity() throws IOException {
    GlbScene scene = new GlbScene();
    float[] positions = {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0};
    float[] uvs = {0, 0, 1, 0, 1, 1, 0, 1};
    scene.addQuad("grass", "grass", "grass", ONE_PIXEL_PNG, 0xA4C954, 0, 0, 0.5f, positions, uvs);
    scene.addQuad("white", "white", "white", ONE_PIXEL_PNG, 0xFFFFFF, 0, 0, 1, positions, uvs);
    scene.addQuad("glow", "glow", "glow", ONE_PIXEL_PNG, 0x808080, 0, 1, 1, positions, uvs);
    scene.addPointLight(0.5f, 0.5f, 0.5f, 0xFFAA70, 15);
    Path output = tempDir.resolve("linear.glb");
    scene.write(output);
    byte[] glb = Files.readAllBytes(output);
    int jsonLength = ByteBuffer.wrap(glb).order(ByteOrder.LITTLE_ENDIAN).getInt(12);
    String json = new String(glb, 20, jsonLength, StandardCharsets.UTF_8);

    float[] grass = numbers(json, "\"grass\",\"pbrMetallicRoughness\":{\"baseColorFactor\":[");
    assertEquals(0.371, grass[0], 1e-3);
    assertEquals(0.584, grass[1], 1e-3);
    assertEquals(0.089, grass[2], 1e-3);
    assertEquals(0.5f, grass[3]);
    float[] white = numbers(json, "\"white\",\"pbrMetallicRoughness\":{\"baseColorFactor\":[");
    assertEquals(List.of(1f, 1f, 1f, 1f), List.of(white[0], white[1], white[2], white[3]));
    float[] glow = numbers(json, "\"emissiveFactor\":[");
    assertEquals(GlbColor.srgbToLinear(0x80) * 0.65f, glow[0]);
    float[] light = numbers(json, "\"type\":\"point\",\"color\":[");
    assertEquals(1f, light[0]);
    assertEquals(GlbColor.srgbToLinear(0xAA), light[1]);
    assertEquals(GlbColor.srgbToLinear(0x70), light[2]);
    assertTrue(json.contains("\"minemories\":{\"format\":3"));
  }

  private static float[] numbers(String json, String prefix) {
    int start = json.indexOf(prefix);
    assertTrue(start >= 0, prefix);
    start += prefix.length();
    String[] parts = json.substring(start, json.indexOf(']', start)).split(",");
    float[] values = new float[parts.length];
    for (int index = 0; index < parts.length; index++)
      values[index] = Float.parseFloat(parts[index]);
    return values;
  }
}
