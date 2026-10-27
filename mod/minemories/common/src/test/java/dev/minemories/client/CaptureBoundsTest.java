package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class CaptureBoundsTest {
  @Test
  void defaultIncludesEightChunksEachWayAndTheDimensionHeight() {
    var bounds = CaptureBounds.around(-140, 250, -64, 320, CaptureBounds.DEFAULT_RADIUS);
    assertEquals(new CaptureBounds(-268, -64, 122, -12, 319, 378), bounds);
    assertEquals(257, bounds.maxX() - bounds.minX() + 1);
  }

  @Test
  void usesCustomRadiusAndRejectsInvalidBounds() {
    assertEquals(new CaptureBounds(-2, 0, -2, 2, 255, 2), CaptureBounds.around(0, 0, 0, 256, 2));
    assertThrows(IllegalArgumentException.class, () -> CaptureBounds.around(0, 0, 0, 256, 129));
    assertThrows(IllegalArgumentException.class, () -> CaptureBounds.around(0, 0, 0, 256, 1));
    assertThrows(IllegalArgumentException.class, () -> CaptureBounds.around(0, 0, 1, 1, 8));
  }

  @Test
  void tileAlignmentCoversWholeTileColumnsWithAnIntegerOrigin() {
    // Radius 32 around x=70 and z=-3 straddles two 64-block columns on each axis.
    var aligned = CaptureBounds.around(70, -3, -64, 320, 32).alignedToTiles(64);
    assertEquals(new CaptureBounds(0, -64, -64, 127, 319, 63), aligned);
    var metadata = new com.google.gson.JsonObject();
    CaptureIdentity.geometry(metadata, aligned);
    assertEquals(63, metadata.getAsJsonObject("captureOrigin").get("x").getAsInt());
    // The same tile columns give the same footprint wherever the player stands inside them.
    assertEquals(aligned, CaptureBounds.around(40, -10, -64, 320, 32).alignedToTiles(64));
  }

  @Test
  void tileAlignmentKeepsFootprintsThatWouldExceedTheCaptureLimit() {
    var wide = CaptureBounds.around(190, 0, 0, 256, 70);
    assertEquals(wide, wide.alignedToTiles(128));
    var edge = new CaptureBounds(Integer.MAX_VALUE - 10, 0, 0, Integer.MAX_VALUE, 10, 10);
    assertEquals(edge, edge.alignedToTiles(48));
    var low = new CaptureBounds(Integer.MIN_VALUE, 0, 0, Integer.MIN_VALUE + 10, 10, 10);
    assertEquals(low.minX(), low.alignedToTiles(48).minX());
  }
}
