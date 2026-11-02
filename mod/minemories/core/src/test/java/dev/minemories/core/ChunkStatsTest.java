package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class ChunkStatsTest {
  @TempDir Path directory;

  private static final float[] UV = {0, 0, 1, 0, 1, 1, 0, 1};

  private static float[] square(float x) {
    return new float[] {x, 0, 0, x + 1, 0, 0, x + 1, 1, 0, x, 1, 0};
  }

  private static void fill(GlbScene scene, float shift) {
    byte[] png = SpoolingGlbSceneTest.PNG;
    scene.addQuad(
        GlbCategory.TERRAIN,
        0,
        0,
        "g",
        "minecraft:grass_block / t",
        "s",
        png,
        0,
        0,
        0,
        1,
        square(0 + shift),
        UV);
    scene.addQuad(
        GlbCategory.TERRAIN,
        0,
        0,
        "p",
        "minecraft:oak_planks / t",
        "s",
        png,
        0,
        0,
        0,
        1,
        square(2),
        UV);
    scene.addQuad(
        GlbCategory.BLOCK_ENTITIES,
        1,
        0,
        "c",
        "minecraft:chest / t",
        "s",
        png,
        0,
        0,
        0,
        1,
        square(20),
        UV);
    scene.addQuad(
        GlbCategory.TERRAIN,
        ChunkRuns.NONE,
        0,
        "x",
        "minecraft:stone / t",
        "s",
        png,
        0,
        0,
        0,
        1,
        square(40),
        UV);
    scene.addPointLight(1, 1, 1, 0xffffff, 15, 0, 0);
    scene.addPointLight(1, 1, 1, 0xffffff, 15, 0, 0);
    scene.addPointLight(1, 1, 1, 0xffffff, 2, 0, 0);
    scene.addPointLight(30, 1, 1, 0xffffff, 15, 1, 0);
    scene.addPointLight(60, 1, 1, 0xffffff, 15);
  }

  @Test
  void quadsBuiltShareBlockEntitiesLightsAndAFingerprintAreCountedPerChunk() {
    GlbScene scene = new GlbScene();
    fill(scene, 0);
    var chunks = scene.chunkStats().snapshot();
    assertEquals(2, chunks.size());
    var origin = chunks.get(0);
    assertEquals(2, origin.quads());
    assertEquals(1, origin.builtQuads());
    assertEquals(0.5, origin.builtShare(), 1e-9);
    assertEquals(1, origin.lights());
    var east = chunks.get(1);
    assertEquals(1, east.blockEntityQuads());
    assertEquals(1, east.lights());
    assertEquals(0, new ChunkStats.Chunk(0, 0, 0, 0, 0, 0, 0, 0).builtShare(), 0);
  }

  @Test
  void theFingerprintChangesWithTheContentOfOneChunkOnlyAndIsStableOtherwise() {
    GlbScene first = new GlbScene(), same = new GlbScene(), changed = new GlbScene();
    fill(first, 0);
    fill(same, 0);
    fill(changed, 5);
    var a = first.chunkStats().snapshot();
    var b = same.chunkStats().snapshot();
    var c = changed.chunkStats().snapshot();
    assertEquals(a.get(0).fingerprint(), b.get(0).fingerprint());
    assertNotEquals(a.get(0).fingerprint(), c.get(0).fingerprint());
    assertEquals(a.get(1).fingerprint(), c.get(1).fingerprint());
  }

  @Test
  void bothWritersCollectTheSameStatistics() throws IOException {
    GlbScene memory = new GlbScene();
    fill(memory, 0);
    try (SpoolingGlbScene spool = new SpoolingGlbScene(directory)) {
      byte[] png = SpoolingGlbSceneTest.PNG;
      spool.addQuad(
          GlbCategory.TERRAIN,
          0,
          0,
          "g",
          "minecraft:grass_block / t",
          "s",
          png,
          0,
          0,
          0,
          1,
          square(0),
          UV);
      spool.addQuad(
          GlbCategory.TERRAIN,
          0,
          0,
          "p",
          "minecraft:oak_planks / t",
          "s",
          png,
          0,
          0,
          0,
          1,
          square(2),
          UV);
      spool.addQuad(
          GlbCategory.BLOCK_ENTITIES,
          1,
          0,
          "c",
          "minecraft:chest / t",
          "s",
          png,
          0,
          0,
          0,
          1,
          square(20),
          UV);
      spool.addPointLight(1, 1, 1, 0xffffff, 15, 0, 0);
      spool.addPointLight(30, 1, 1, 0xffffff, 15, 1, 0);
      spool.addPointLight(60, 1, 1, 0xffffff, 15);
      assertEquals(memory.chunkStats().snapshot(), spool.chunkStats().snapshot());
    }
  }

  @Test
  void theFingerprintIgnoresWhereTheCaptureOriginIsAndTheOrderOfQuadsButNotMovedOrAddedBlocks() {
    byte[] png = SpoolingGlbSceneTest.PNG;
    // The same block at absolute (35, 70, 5), seen from two different origins, with quads in
    // another order.
    GlbScene first = new GlbScene(), second = new GlbScene(), moved = new GlbScene();
    float[] a = {3, 0, 5, 4, 0, 5, 4, 1, 5, 3, 1, 5};
    float[] b = {3, 0, 6, 4, 0, 6, 4, 1, 6, 3, 1, 6};
    first.addQuad(
        GlbCategory.TERRAIN, 0, 0, "s", "minecraft:stone / t", "s", png, 0, 0, 0, 1, a, UV);
    first.addQuad(
        GlbCategory.TERRAIN, 0, 0, "s", "minecraft:stone / t", "s", png, 0, 0, 0, 1, b, UV);
    // Origin (32, 70, 0) for `first`; origin (30, 60, -2) shifts every coordinate by (+2, +10, +2)
    // and the chunk by (+1, +1).
    float[] a2 = new float[12], b2 = new float[12];
    for (int index = 0; index < 12; index += 3) {
      a2[index] = a[index] + 2;
      a2[index + 1] = a[index + 1] + 10;
      a2[index + 2] = a[index + 2] + 2;
      b2[index] = b[index] + 2;
      b2[index + 1] = b[index + 1] + 10;
      b2[index + 2] = b[index + 2] + 2;
    }
    second.addQuad(
        GlbCategory.TERRAIN, 1, 1, "s", "minecraft:stone / t", "s", png, 0, 0, 0, 1, b2, UV);
    second.addQuad(
        GlbCategory.TERRAIN, 1, 1, "s", "minecraft:stone / t", "s", png, 0, 0, 0, 1, a2, UV);
    second.addQuad(
        GlbCategory.ENTITIES, 1, 1, "e", "minecraft:cow / t", "s", png, 0, 0, 0, 1, b2, UV);
    float[] shifted = a.clone();
    shifted[0] += 1;
    moved.addQuad(
        GlbCategory.TERRAIN, 0, 0, "s", "minecraft:stone / t", "s", png, 0, 0, 0, 1, shifted, UV);
    moved.addQuad(
        GlbCategory.TERRAIN, 0, 0, "s", "minecraft:stone / t", "s", png, 0, 0, 0, 1, b, UV);
    long one = first.chunkStats().snapshot(32, 70, 0).get(0).fingerprint();
    long two = second.chunkStats().snapshot(30, 60, -2).get(0).fingerprint();
    long three = moved.chunkStats().snapshot(32, 70, 0).get(0).fingerprint();
    assertEquals(one, two);
    assertNotEquals(one, three);
    assertNotEquals(one, first.chunkStats().snapshot(32, 71, 0).get(0).fingerprint());
  }

  @Test
  void theNumberOfTrackedChunksIsBounded() {
    ChunkStats stats = new ChunkStats();
    for (int index = 0; index < ChunkStats.MAX_CHUNKS + 10; index++)
      stats.quad(GlbCategory.TERRAIN, index, 0, "minecraft:stone", square(0));
    assertEquals(ChunkStats.MAX_CHUNKS, stats.snapshot().size());
    stats.light(ChunkStats.MAX_CHUNKS + 5, 0);
  }
}
