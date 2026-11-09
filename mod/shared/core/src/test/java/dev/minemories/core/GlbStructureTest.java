package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class GlbStructureTest {
  @TempDir Path temporary;

  private static final float[] UV = {0, 0, 1, 0, 1, 1, 0, 1};

  private static float[] square(float x, float z) {
    return new float[] {x, 0, z, x + 1, 0, z, x + 1, 1, z, x, 1, z};
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

  private interface Sink {
    void add(GlbCategory category, int cx, int cz, String key, float[] xyz) throws IOException;
  }

  private void fill(Sink sink) throws IOException {
    sink.add(GlbCategory.TERRAIN, 0, 0, "stone", square(0, 0));
    sink.add(GlbCategory.TERRAIN, 0, 0, "stone", square(2, 0));
    sink.add(GlbCategory.TERRAIN, 1, 0, "stone", square(20, 0));
    sink.add(GlbCategory.TERRAIN, 0, 0, "stone", square(4, 0));
    sink.add(GlbCategory.DECOR, -1, 2, "fern", square(-3, 40));
    sink.add(GlbCategory.FLUIDS, 0, 0, "water", square(6, 0));
    sink.add(GlbCategory.ENTITIES, 0, 0, "cow", square(8, 0));
  }

  private String written(boolean spooled) throws IOException {
    Path output = temporary.resolve(spooled ? "spool.glb" : "memory.glb");
    if (spooled) {
      try (SpoolingGlbScene scene = new SpoolingGlbScene(temporary)) {
        scene.setSource("1.21.1", "neoforge", "0.30.2", "minecraft:overworld");
        fill(
            (category, cx, cz, key, xyz) ->
                scene.addQuad(
                    category,
                    cx,
                    cz,
                    key,
                    key,
                    "sprite",
                    SpoolingGlbSceneTest.PNG,
                    0,
                    0,
                    0,
                    1,
                    xyz,
                    UV));
        scene.write(output);
      }
    } else {
      GlbScene scene = new GlbScene();
      scene.setSource("1.21.1", "neoforge", "0.30.2", "minecraft:overworld");
      fill(
          (category, cx, cz, key, xyz) ->
              scene.addQuad(
                  category,
                  cx,
                  cz,
                  key,
                  key,
                  "sprite",
                  SpoolingGlbSceneTest.PNG,
                  0,
                  0,
                  0,
                  1,
                  xyz,
                  UV));
      scene.write(output);
    }
    return json(output);
  }

  @Test
  void categoriesBecomeNamedNodesAndMeshesWithChunkRangesAndSafeMetadata() throws IOException {
    String text = written(false);
    assertTrue(text.contains("\"extras\":{\"minemories\":{\"format\":3,\"minecraft\":\"1.21.1\""));
    assertTrue(text.contains("\"dimension\":\"minecraft:overworld\",\"chunkSize\":16"));
    assertTrue(text.contains("\"terrain\":{\"quads\":4}"));
    assertTrue(text.contains("\"fluids\":{\"quads\":1}"));
    assertFalse(text.contains("block_entities\":{"));
    for (String name : new String[] {"terrain", "decor", "fluids", "entities"}) {
      assertTrue(text.contains("{\"name\":\"" + name + "\",\"translation\":"), name);
      assertTrue(text.contains("{\"name\":\"" + name + "\",\"primitives\":["), name);
    }
    // x/z chunk, first triangle, triangle count: the two chunk-0 runs are separate because the
    // quad of chunk 1 came between them.
    assertTrue(text.contains("\"minemoriesChunks\":[0,0,0,4,1,0,4,2,0,0,6,2]"), text);
    assertTrue(text.contains("\"minemoriesChunks\":[-1,2,0,2]"), text);
    assertFalse(text.contains("\"mesh\":0}],"), "a single mesh is no longer written");
  }

  @Test
  void bothWritersEmitTheSameBytes() throws IOException {
    written(false);
    written(true);
    assertArrayEquals(
        Files.readAllBytes(temporary.resolve("memory.glb")),
        Files.readAllBytes(temporary.resolve("spool.glb")));
  }

  @Test
  void unsafeSourceValuesAreIgnoredAndQuadsWithoutChunkPublishNoRanges() throws IOException {
    GlbScene scene = new GlbScene();
    scene.setSource("1.21.1 \"x\"", null, "C:\\Users\\player", "../world");
    scene.addQuad(
        "plain", "plain", "sprite", SpoolingGlbSceneTest.PNG, 0, 0, 0, 1, square(0, 0), UV);
    Path output = temporary.resolve("plain.glb");
    scene.write(output);
    String text = json(output);
    assertTrue(text.contains("\"minemories\":{\"format\":3,\"chunkSize\":16"), text);
    assertFalse(text.contains("Users"));
    assertFalse(text.contains("minemoriesChunks"));
  }

  @Test
  void aSceneThatExceedsTheRunBudgetDropsRangesInsteadOfGrowingTheJson() throws IOException {
    ChunkRuns.Budget budget = new ChunkRuns.Budget();
    ChunkRuns runs = new ChunkRuns(budget);
    for (int index = 0; index < 40_000; index++) {
      new ChunkRuns(budget).record(index, 0, 0, 1);
    }
    runs.record(0, 0, 0, 1);
    assertNull(runs.json());
    ChunkRuns empty = new ChunkRuns(new ChunkRuns.Budget());
    empty.record(0, 0, 3, 3);
    assertNull(empty.json());
    empty.record(ChunkRuns.NONE, 0, 0, 1);
    empty.record(5, 5, 1, 2);
    assertNull(empty.json());
  }
}
