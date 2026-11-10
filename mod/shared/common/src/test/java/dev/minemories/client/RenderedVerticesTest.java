package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class RenderedVerticesTest {
  @Test
  void capturesPositionsUvsAndColorIncludingLastVertex() {
    List<RenderedVertices.Vertex[]> quads = new ArrayList<>();
    var consumer = new RenderedVertices(RenderedVertices.Mode.QUADS, quads::add);
    for (int index = 0; index < 4; index++) {
      consumer.addVertex(10 + index, 22, 33).setColor(12, 34, 56, 128).setUv(index / 4f, .75f);
    }
    assertTrue(quads.isEmpty());
    consumer.finish();
    assertEquals(1, quads.size());
    for (int index = 0; index < 4; index++)
      assertEquals(
          new RenderedVertices.Vertex(10 + index, 22, 33, index / 4f, .75f, 12, 34, 56, 128),
          quads.getFirst()[index]);
    consumer.finish();
    assertEquals(1, quads.size());
  }

  @Test
  void incompletePrimitivesAreDiscardedAndAttributesResetForNextVertex() {
    List<RenderedVertices.Vertex[]> quads = new ArrayList<>();
    var consumer = new RenderedVertices(RenderedVertices.Mode.QUADS, quads::add);
    consumer.addVertex(0, 0, 0).setColor(-10, 300, 8, 500).setUv(.5f, .5f);
    consumer.finish();
    assertTrue(quads.isEmpty());
    consumer.addVertex(0, 0, 0).setColor(-10, 300, 8, 500).setUv(.5f, .5f);
    for (int index = 1; index < 4; index++) consumer.addVertex(index, 0, 0);
    consumer.finish();
    // Minecraft's buffers keep the low byte ((byte) value), they do not clamp.
    assertEquals(246, quads.getFirst()[0].red());
    assertEquals(44, quads.getFirst()[0].green());
    assertEquals(244, quads.getFirst()[0].alpha());
    assertEquals(
        new RenderedVertices.Vertex(3, 0, 0, 0, 0, 255, 255, 255, 255), quads.getFirst()[3]);
  }

  @Test
  void signedByteColorsFromCreateStayOpaqueAndKeepRealTranslucency() {
    // Create's SuperByteBuffer passes VertexList.getR/G/B/A bytes straight to color(int, ...):
    // opaque white is (-1, -1, -1, -1). Clamping turned it into black with alpha 0 (invisible).
    List<RenderedVertices.Vertex[]> quads = new ArrayList<>();
    var consumer = new RenderedVertices(RenderedVertices.Mode.QUADS, quads::add);
    for (int index = 0; index < 4; index++)
      consumer.addVertex(index, 0, 0).setColor((byte) 255, (byte) 200, 127, (byte) 255);
    for (int index = 0; index < 4; index++)
      consumer.addVertex(index, 1, 0).setColor(-1, -1, -1, (byte) 128);
    for (int index = 0; index < 4; index++) consumer.addVertex(index, 2, 0).setColor(9, 9, 9, 100);
    consumer.finish();
    assertEquals(new RenderedVertices.Vertex(0, 0, 0, 0, 0, 255, 200, 127, 255), quads.get(0)[0]);
    assertEquals(new RenderedVertices.Vertex(0, 1, 0, 0, 0, 255, 255, 255, 128), quads.get(1)[0]);
    assertEquals(100, quads.get(2)[3].alpha(), "A translucent part stays translucent");
  }

  @Test
  void independentTrianglesAndConnectedModesPreserveWinding() {
    for (var mode :
        List.of(
            RenderedVertices.Mode.TRIANGLES,
            RenderedVertices.Mode.TRIANGLE_STRIP,
            RenderedVertices.Mode.TRIANGLE_FAN)) {
      List<RenderedVertices.Vertex[]> quads = new ArrayList<>();
      var consumer = new RenderedVertices(mode, quads::add);
      float[][] positions =
          mode == RenderedVertices.Mode.TRIANGLE_STRIP
              ? new float[][] {{0, 0}, {1, 0}, {0, 1}, {1, 1}}
              : new float[][] {{0, 0}, {1, 0}, {1, 1}, {0, 1}};
      for (float[] position : positions) consumer.addVertex(position[0], position[1], 0);
      consumer.finish();
      assertEquals(mode == RenderedVertices.Mode.TRIANGLES ? 1 : 2, quads.size());
      for (var quad : quads) {
        assertEquals(quad[2], quad[3], "The unused second GLB triangle is degenerate");
        float winding =
            (quad[1].x() - quad[0].x()) * (quad[2].y() - quad[0].y())
                - (quad[1].y() - quad[0].y()) * (quad[2].x() - quad[0].x());
        assertTrue(winding > 0, mode.toString());
      }
    }
  }

  @Test
  void streamsLargeModelsWithoutReusingEmittedPrimitiveArrays() {
    AtomicInteger count = new AtomicInteger();
    var consumer =
        new RenderedVertices(
            RenderedVertices.Mode.QUADS,
            vertices -> {
              assertEquals(count.get() * 4, vertices[0].x());
              vertices[0] = null; // The receiver does not own the pending primitive buffer.
              count.incrementAndGet();
            });
    for (int index = 0; index < 40000; index++) consumer.addVertex(index, 0, 0);
    consumer.finish();
    assertEquals(10000, count.get());
    assertThrows(NullPointerException.class, () -> new RenderedVertices(null, vertices -> {}));
  }
}
