package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Block-model and fluid quads are back-face culled like chunk geometry; renderers stay two-sided.
 */
final class MaterialSidednessTest {
  private static final float[] UV = {0, 0, 1, 0, 1, 1, 0, 1};
  // A zero-thickness plane drawn once per winding, as Minecraft's cross models and fluid surfaces
  // are: each side must show exactly one of the two faces, so neither may be double-sided.
  private static final float[] FRONT = {0, 0, 0.5f, 1, 0, 0.5f, 1, 1, 0.5f, 0, 1, 0.5f};
  private static final float[] BACK = {0, 1, 0.5f, 1, 1, 0.5f, 1, 0, 0.5f, 0, 0, 0.5f};
  private static final Pattern MATERIAL =
      Pattern.compile("\\{\"name\":\"([^\"]+)\",\"pbr[^}]*}[^}]*}[^}]*}");

  @TempDir Path temporary;

  private interface Sink {
    void add(GlbCategory category, String key, boolean doubleSided, float[] xyz) throws IOException;
  }

  private static void fill(Sink sink) throws IOException {
    sink.add(GlbCategory.TERRAIN, "stone", false, FRONT);
    sink.add(GlbCategory.DECOR, "fern", false, FRONT);
    sink.add(GlbCategory.DECOR, "fern", false, BACK);
    sink.add(GlbCategory.FLUIDS, "water", false, FRONT);
    sink.add(GlbCategory.FLUIDS, "water", false, BACK);
    // One key used by a culled pass and by a no-cull pass must not merge into one material.
    sink.add(GlbCategory.BLOCK_ENTITIES, "banner", true, FRONT);
    sink.add(GlbCategory.BLOCK_ENTITIES, "banner", false, BACK);
    sink.add(GlbCategory.ENTITIES, "cow", true, FRONT);
  }

  private Path memory() throws IOException {
    GlbScene scene = new GlbScene();
    fill(
        (category, key, doubleSided, xyz) ->
            scene.addQuad(
                category,
                0,
                0,
                key,
                key + (doubleSided ? " two-sided" : " culled"),
                "sprite",
                SpoolingGlbSceneTest.PNG,
                0xffffff,
                0,
                0,
                1,
                doubleSided,
                xyz,
                UV));
    assertEquals(6, scene.materialCount());
    Path output = temporary.resolve("memory.glb");
    scene.write(output);
    return output;
  }

  private Path spooled() throws IOException {
    Path output = temporary.resolve("spool.glb");
    try (SpoolingGlbScene scene = new SpoolingGlbScene(temporary)) {
      fill(
          (category, key, doubleSided, xyz) ->
              scene.addQuad(
                  category,
                  0,
                  0,
                  key,
                  key + (doubleSided ? " two-sided" : " culled"),
                  "sprite",
                  SpoolingGlbSceneTest.PNG,
                  0xffffff,
                  0,
                  0,
                  1,
                  doubleSided,
                  xyz,
                  UV));
      scene.write(output);
      assertEquals(6, scene.metrics().materials());
    }
    return output;
  }

  private static String json(Path file) throws IOException {
    byte[] bytes = Files.readAllBytes(file);
    int length =
        (bytes[12] & 255)
            | (bytes[13] & 255) << 8
            | (bytes[14] & 255) << 16
            | (bytes[15] & 255) << 24;
    return new String(bytes, 20, length, StandardCharsets.UTF_8);
  }

  @Test
  void onlyRendererMaterialsAreDoubleSided() throws IOException {
    String json = json(memory());
    Matcher material = MATERIAL.matcher(json.substring(json.indexOf("\"materials\":[")));
    int culled = 0, twoSided = 0;
    while (material.find()) {
      boolean doubleSided = material.group().contains("\"doubleSided\":true");
      assertEquals(material.group(1).endsWith(" two-sided"), doubleSided, material.group());
      if (doubleSided) twoSided++;
      else culled++;
    }
    assertEquals(4, culled);
    assertEquals(2, twoSided);
    assertFalse(json.contains("\"doubleSided\":false"), "glTF's default is single-sided");
  }

  @Test
  void bothWritersAgreeByteForByte() throws IOException {
    assertArrayEquals(Files.readAllBytes(memory()), Files.readAllBytes(spooled()));
  }

  @Test
  void theFormerOverloadsStayDoubleSided() throws IOException {
    GlbScene scene = new GlbScene();
    scene.addQuad("k", "k", "sprite", SpoolingGlbSceneTest.PNG, 0, 0, 0, 1, FRONT, UV);
    Path output = temporary.resolve("default.glb");
    scene.write(output);
    assertTrue(json(output).contains("\"doubleSided\":true"));
    try (SpoolingGlbScene spool = new SpoolingGlbScene(temporary)) {
      spool.addQuad("k", "k", "sprite", SpoolingGlbSceneTest.PNG, 0, 0, 0, 1, FRONT, UV);
      Path spooledOutput = temporary.resolve("default-spool.glb");
      spool.write(spooledOutput);
      assertArrayEquals(Files.readAllBytes(output), Files.readAllBytes(spooledOutput));
    }
  }
}
