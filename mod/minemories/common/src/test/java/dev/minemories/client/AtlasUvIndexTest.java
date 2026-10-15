package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;

class AtlasUvIndexTest {
  @Test
  void selectsTheSpriteAndPreservesTexelCoordinatesWhenRebasedToTheCrop() throws Exception {
    var left = new AtlasUvIndex.Region<>(0, 0, .25f, 1, "left");
    var target = new AtlasUvIndex.Region<>(.25f, .5f, .5f, .75f, "water");
    var index = new AtlasUvIndex<>(List.of(left, target));
    float[] original = {.25f, .5f, .5f, .5f, .5f, .75f, .25f, .75f};
    float[] uv = original.clone();
    var found = index.find(uv);
    assertSame(target, found);
    found.remap(uv);
    assertArrayEquals(new float[] {0, 0, 1, 0, 1, 1, 0, 1}, uv);
    for (int i = 0; i < 8; i += 2) {
      assertEquals(original[i] * 8192, 2048 + uv[i] * 2048);
      assertEquals(original[i + 1] * 8192, 4096 + uv[i + 1] * 2048);
    }
  }

  @Test
  void handlesTinySpritesTouchingAtlasEdges() throws Exception {
    float step = 16f / 8192;
    var tiny = new AtlasUvIndex.Region<>(1 - step, 1 - step, 1, 1, "tiny");
    var index = new AtlasUvIndex<>(List.of(tiny));
    assertSame(tiny, index.find(new float[] {1 - step, 1 - step, 1, 1 - step, 1, 1, 1 - step, 1}));
    assertThrows(IOException.class, () -> index.find(new float[] {0, 0, 0, 0, 0, 0, 0, 0}));
  }

  @Test
  void rejectsQuadsCrossingSpritesInsteadOfSamplingAnUnrelatedTexture() throws Exception {
    var index =
        new AtlasUvIndex<>(
            List.of(
                new AtlasUvIndex.Region<>(0, 0, .5f, 1, "left"),
                new AtlasUvIndex.Region<>(.5f, 0, 1, 1, "right")));
    assertThrows(
        IOException.class, () -> index.find(new float[] {.25f, 0, .75f, 0, .75f, 1, .25f, 1}));
    assertThrows(IOException.class, () -> index.find(new float[] {-1, 0, 0, 0, 0, 1, -1, 1}));
    assertThrows(IllegalArgumentException.class, () -> index.find(new float[4]));
    assertNull(index.find(new float[] {Float.NaN, 0, 0, 0, 0, 0, 0, 0}));
    assertNull(index.find(new float[] {0, Float.POSITIVE_INFINITY, 0, 0, 0, 0, 0, 0}));
  }

  @Test
  void validatesBoundsWithoutMaterializingTheEntireAtlas() throws Exception {
    assertThrows(
        IllegalArgumentException.class, () -> new AtlasUvIndex.Region<>(0, 0, 0, 1, "bad"));
    assertThrows(
        IllegalArgumentException.class, () -> new AtlasUvIndex.Region<>(0, 0, Float.NaN, 1, "bad"));
    assertThrows(NullPointerException.class, () -> new AtlasUvIndex.Region<>(0, 0, 1, 1, null));
    assertThrows(NullPointerException.class, () -> new AtlasUvIndex<String>(null));
    var index = new AtlasUvIndex<>(List.<AtlasUvIndex.Region<String>>of());
    assertThrows(IOException.class, () -> index.find(new float[8]));
    var left = new AtlasUvIndex.Region<>(0, 0, .5f, 1, "left");
    var right = new AtlasUvIndex.Region<>(.5f, 0, 1, 1, "right");
    var visits = new java.util.concurrent.atomic.AtomicInteger();
    Iterable<AtlasUvIndex.Region<String>> atlas =
        () ->
            java.util.stream.Stream.concat(
                    Collections.nCopies(80_000, left).stream(), java.util.stream.Stream.of(right))
                .peek(ignored -> visits.incrementAndGet())
                .iterator();
    var large = new AtlasUvIndex<>(atlas);
    assertEquals(0, visits.get());
    float[] uv = {.75f, 0, .75f, 0, .75f, 1, .75f, 1};
    assertSame(right, large.find(uv));
    assertEquals(80_001, visits.get());
    assertSame(right, large.find(uv));
    assertEquals(80_001, visits.get(), "Repeated primitives must not rescan the large atlas");
  }

  @Test
  void boundsEachSearchAndTheCumulativeWorkOfManyDistinctLookups() {
    var left = new AtlasUvIndex.Region<>(0, 0, .5f, 1, "left");
    float[] missing = {.75f, 0, .75f, 0, .75f, 1, .75f, 1};
    var oversized = new AtlasUvIndex<>(Collections.nCopies(1_048_577, left));
    assertThrows(IOException.class, () -> oversized.find(missing));
    var budget = new AtlasUvIndex.SearchBudget();
    var many = new AtlasUvIndex<>(Collections.nCopies(1_048_576, left), budget);
    for (int i = 0; i < 32; i++) assertThrows(IOException.class, () -> many.find(missing));
    assertThrows(
        IOException.class,
        () -> many.find(new float[8]),
        "A new matching sprite must still respect the cumulative work budget");
  }

  @Test
  void boundsTheNumberOfRetainedMatches() throws Exception {
    var regions = new java.util.ArrayList<AtlasUvIndex.Region<Integer>>();
    for (int i = 0; i < 257; i++)
      regions.add(new AtlasUvIndex.Region<>(i / 257f, 0, (i + 1) / 257f, 1, i));
    var index = new AtlasUvIndex<>(regions);
    for (int i = 0; i < 256; i++) {
      float u = (i + .5f) / 257;
      assertEquals(i, index.find(new float[] {u, 0, u, 0, u, 1, u, 1}).value());
    }
    float u = 256.5f / 257;
    assertThrows(IOException.class, () -> index.find(new float[] {u, 0, u, 0, u, 1, u, 1}));
  }
}
