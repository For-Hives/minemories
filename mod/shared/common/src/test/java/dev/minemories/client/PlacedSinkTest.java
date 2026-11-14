package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import dev.minemories.core.GlbCategory;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class PlacedSinkTest {
  private static final int PLOT = 20_480_000;

  private static final class Recorder implements CaptureSink {
    final List<float[]> positions = new ArrayList<>();
    final List<float[]> uvs = new ArrayList<>();
    final List<Integer> layers = new ArrayList<>();
    final List<String> classes = new ArrayList<>();
    float[] light;

    @Override
    public void addQuad(
        String key,
        String name,
        String image,
        byte[] png,
        int tint,
        int alpha,
        float emission,
        float opacity,
        float[] xyz,
        float[] uv) {
      positions.add(xyz);
      uvs.add(uv);
      layers.add(-1);
    }

    @Override
    public void addRenderedQuad(
        String key,
        String name,
        String image,
        byte[] png,
        int tint,
        int alpha,
        float emission,
        float opacity,
        float[] xyz,
        float[] uv,
        int layer) {
      positions.add(xyz);
      uvs.add(uv);
      layers.add(layer);
    }

    @Override
    public void addPointLight(float x, float y, float z, int color, int level) {
      light = new float[] {x, y, z, color, level};
    }

    @Override
    public void classify(GlbCategory category, int chunkX, int chunkZ) {
      classes.add(category + "@" + chunkX + "," + chunkZ);
    }

    @Override
    public boolean hasGeometry() {
      return !positions.isEmpty();
    }

    @Override
    public int materialCount() {
      return 7;
    }

    @Override
    public void write(Path output) {}
  }

  private static final CaptureBounds CELLS =
      new CaptureBounds(PLOT, 60, PLOT, PLOT + 3, 63, PLOT + 3);

  @Test
  void movesStoredGeometryToWhereItIsDrawn() throws Exception {
    var recorder = new Recorder();
    var sink =
        new PlacedSink(
            recorder,
            Placement.translation(-PLOT + 40, 10, -PLOT - 30),
            CELLS,
            new int[] {32, 64, -32});
    float[] quad = {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0};
    sink.addQuad("k", "n", "i", new byte[0], 0, 0, 0, 1, quad, new float[8]);
    sink.addRenderedQuad("k", "n", "i", new byte[0], 0, 0, 0, 1, quad, new float[8], 2);
    assertArrayEquals(new float[] {8, 6, 2, 9, 6, 2, 9, 7, 2, 8, 7, 2}, recorder.positions.get(0));
    assertArrayEquals(recorder.positions.get(0), recorder.positions.get(1));
    assertEquals(List.of(-1, 2), recorder.layers);
    sink.addPointLight(0.5f, 0.5f, 0.5f, 0xFFF0D0, 12);
    assertArrayEquals(new float[] {8.5f, 6.5f, 2.5f, 0xFFF0D0, 12}, recorder.light);
    assertTrue(sink.hasGeometry());
    assertEquals(7, sink.materialCount());
    assertArrayEquals(new int[] {PLOT, 60, PLOT}, sink.origin());
    assertThrows(IllegalStateException.class, () -> sink.write(Path.of("unused.glb")));
  }

  @Test
  void everythingBelongsToTheChunkTheVolumeIsDrawnOver() {
    var recorder = new Recorder();
    var sink =
        new PlacedSink(
            recorder,
            Placement.translation(-PLOT + 40, 10, -PLOT - 30),
            CELLS,
            new int[] {0, 64, 0});
    sink.classify(GlbCategory.BLOCK_ENTITIES, 1_280_000, 1_280_000);
    sink.classify(GlbCategory.ENTITIES, -9, 4);
    assertEquals(List.of("BLOCK_ENTITIES@2,-2", "ENTITIES@2,-2"), recorder.classes);
  }

  @Test
  void aMirrorReversesTheVertexOrder() throws Exception {
    var recorder = new Recorder();
    var mirror = new Placement(0, 0, 0, 0, 0, 0, 1, 0, 0, 0, -1, 1, 1);
    var sink = new PlacedSink(recorder, mirror, new CaptureBounds(0, 0, 0, 0, 0, 0), new int[3]);
    float[] quad = {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0};
    float[] uv = {0, 0, 1, 0, 1, 1, 0, 1};
    sink.addQuad("k", "n", "i", new byte[0], 0, 0, 0, 1, quad, uv);
    assertArrayEquals(
        new float[] {0, 1, 0, -1, 1, 0, -1, 0, 0, 0, 0, 0}, recorder.positions.get(0));
    assertArrayEquals(new float[] {0, 1, 1, 1, 1, 0, 0, 0}, recorder.uvs.get(0));
  }
}
