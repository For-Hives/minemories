package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class VertexWeldingTest {
  @TempDir Path temporary;

  private static final float[] FIRST = {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0};
  private static final float[] FIRST_UV = {0, 0, 1, 0, 1, 1, 0, 1};
  // Shares the edge x = 1 and the matching UV corners with FIRST, on the same plane.
  private static final float[] NEXT = {1, 0, 0, 2, 0, 0, 2, 1, 0, 1, 1, 0};
  private static final float[] NEXT_UV = {1, 0, 2, 0, 2, 1, 1, 1};

  private static String json(Path file) throws IOException {
    byte[] bytes = Files.readAllBytes(file);
    int length =
        (bytes[12] & 255)
            | (bytes[13] & 255) << 8
            | (bytes[14] & 255) << 16
            | (bytes[15] & 255) << 24;
    return new String(bytes, 20, length, StandardCharsets.UTF_8);
  }

  private void quads(GlbScene memory, SpoolingGlbScene spool, float[][] shapes) throws IOException {
    for (float[] shape : shapes) {
      float[] uv = shape == FIRST ? FIRST_UV : NEXT_UV;
      memory.addQuad("k", "k", "sprite", SpoolingGlbSceneTest.PNG, 0xffffff, 0, 0, 1, shape, uv);
      spool.addQuad("k", "k", "sprite", SpoolingGlbSceneTest.PNG, 0xffffff, 0, 0, 1, shape, uv);
    }
  }

  @Test
  void sharedEdgesAndRepeatedQuadsAreWeldedIdenticallyByBothWriters() throws IOException {
    GlbScene memory = new GlbScene();
    Path a = temporary.resolve("memory.glb"), b = temporary.resolve("spool.glb");
    try (SpoolingGlbScene spool = new SpoolingGlbScene(temporary)) {
      quads(memory, spool, new float[][] {FIRST, NEXT, FIRST});
      memory.write(a);
      spool.write(b);
    }
    assertArrayEquals(Files.readAllBytes(a), Files.readAllBytes(b));
    String text = json(a);
    // 6 shared-edge vertices, and the repeated quad adds neither a vertex nor a triangle pair
    // beyond its own 6 indices.
    assertTrue(text.contains("\"count\":6,\"type\":\"VEC3\""), text);
    assertTrue(text.contains("\"count\":18,\"type\":\"SCALAR\""), text);
  }

  @Test
  void aQuadWithoutAreaIsDroppedButATriangleQuadKeepsItsNormal() throws IOException {
    float[] flat = new float[12];
    float[] triangle = {0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0};
    GlbScene memory = new GlbScene();
    memory.addQuad("flat", "flat", "sprite", SpoolingGlbSceneTest.PNG, 0, 0, 0, 1, flat, FIRST_UV);
    assertFalse(memory.hasGeometry());
    try (SpoolingGlbScene spool = new SpoolingGlbScene(temporary)) {
      spool.addQuad("flat", "flat", "sprite", SpoolingGlbSceneTest.PNG, 0, 0, 0, 1, flat, FIRST_UV);
      assertFalse(spool.hasGeometry());
      spool.addQuad(
          "tri", "tri", "sprite", SpoolingGlbSceneTest.PNG, 0, 0, 0, 1, triangle, FIRST_UV);
      assertTrue(spool.hasGeometry());
      assertEquals(1, spool.materialCount());
    }
    float[] normal = new float[3];
    assertTrue(QuadGeometry.normal(triangle, normal));
    assertEquals(1f, Math.abs(normal[2]));
  }

  @Test
  void theCacheReusesExactVerticesOnlyWithinAPrimitiveAndForgetsOnCollision() {
    VertexCache cache = new VertexCache();
    float[] vertex = {1, 2, 3, 0, 0, 1, 0.5f, 0.5f};
    assertEquals(-1, cache.intern(0, vertex, 7));
    assertEquals(7, cache.intern(0, vertex, 8));
    assertEquals(-1, cache.intern(1, vertex, 0));
    vertex[0] = -0f;
    float[] zero = vertex.clone();
    zero[0] = 0f;
    assertEquals(-1, cache.intern(2, vertex, 1));
    assertEquals(-1, cache.intern(2, zero, 2));
    float[] probe = {5, 5, 5, 0, 1, 0, 0, 0};
    assertEquals(-1, cache.intern(3, probe, 0));
    boolean evicted = false;
    for (int index = 1; index < 400_000 && !evicted; index++) {
      float[] other = {index, 1, 2, 0, 1, 0, 0, 0};
      cache.intern(3, other, index);
      evicted = cache.intern(3, probe, 0) == -1;
    }
    assertTrue(evicted, "a direct-mapped cache must eventually evict");
  }
}
