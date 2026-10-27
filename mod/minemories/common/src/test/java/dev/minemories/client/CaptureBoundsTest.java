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
}
