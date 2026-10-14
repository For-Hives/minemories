package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class RenderedLayerTest {
  @Test
  void alphaOverlayMovesAlongTheFaceNormalWithoutChangingItsShape() {
    float[] quad = {0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0};
    float[] original = quad.clone();
    RenderedLayer.separate(quad, 0);
    assertArrayEquals(original, quad);
    RenderedLayer.separate(quad, 1);
    assertArrayEquals(new float[] {0, 0, .002f, 2, 0, .002f, 2, 2, .002f, 0, 2, .002f}, quad);
    float[] reverse = {0, 0, 0, 0, 2, 0, 2, 2, 0, 2, 0, 0};
    RenderedLayer.separate(reverse, 1);
    assertEquals(-.002f, reverse[2]);
  }

  @Test
  void capsDisplacementAndLeavesInvalidFacesForTheCoreFiniteGuard() {
    float[] quad = {0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0};
    RenderedLayer.separate(quad, Integer.MAX_VALUE);
    assertEquals(.016f, quad[2]);
    float[] degenerate = new float[12];
    RenderedLayer.separate(degenerate, 1);
    assertArrayEquals(new float[12], degenerate);
    quad[0] = Float.NaN;
    float[] original = quad.clone();
    RenderedLayer.separate(quad, 1);
    assertArrayEquals(original, quad);
    assertThrows(IllegalArgumentException.class, () -> RenderedLayer.separate(new float[3], 1));
  }
}
