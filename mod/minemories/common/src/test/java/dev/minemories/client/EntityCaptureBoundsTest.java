package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class EntityCaptureBoundsTest {
  @Test
  void selectionContainsTheWholeLastBlockButExcludesItsOutsideNeighbor() {
    var bounds = new CaptureBounds(-3, -10, 7, 2, 4, 9);
    assertTrue(bounds.containsEntity(-3, -10, 7));
    assertTrue(bounds.containsEntity(2.99, 4.99, 9.99));
    assertFalse(bounds.containsEntity(-3.01, 0, 8));
    assertFalse(bounds.containsEntity(3, 0, 8));
    assertFalse(bounds.containsEntity(0, -10.01, 8));
    assertFalse(bounds.containsEntity(0, 5, 8));
    assertFalse(bounds.containsEntity(0, 0, 6.99));
    assertFalse(bounds.containsEntity(0, 0, 10));
  }

  @Test
  void malformedEntityPositionsCannotEnterACapture() {
    var bounds = new CaptureBounds(-1, -1, -1, 1, 1, 1);
    for (double invalid :
        new double[] {Double.NaN, Double.NEGATIVE_INFINITY, Double.POSITIVE_INFINITY}) {
      assertFalse(bounds.containsEntity(invalid, 0, 0));
      assertFalse(bounds.containsEntity(0, invalid, 0));
      assertFalse(bounds.containsEntity(0, 0, invalid));
    }
  }
}
