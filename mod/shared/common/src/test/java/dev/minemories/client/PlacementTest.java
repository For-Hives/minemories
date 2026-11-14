package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class PlacementTest {
  /** Sable stores sub-levels in plots around 10,000 × 128 chunks from the origin. */
  private static final double PLOT = 20_480_000;

  private static final double HALF = Math.sqrt(0.5);

  /** A quarter turn about Y: +X goes to -Z. */
  private static Placement quarterTurn(double pivot, double x, double y, double z) {
    return new Placement(x, y, z, 0, HALF, 0, HALF, pivot, 64, pivot, 1, 1, 1);
  }

  private static void assertPoint(double[] expected, double[] actual) {
    for (int axis = 0; axis < 3; axis++) assertEquals(expected[axis], actual[axis], 1e-6);
  }

  @Test
  void translatesWithoutTurning() {
    Placement placement = Placement.translation(5, -2, 7);
    assertPoint(new double[] {6, 1, 10}, placement.toWorld(1, 3, 3));
    assertPoint(new double[] {1, 3, 3}, placement.toLocal(6, 1, 10));
    assertTrue(placement.keepsWinding());
  }

  @Test
  void turnsAboutThePivotThenMovesToThePosition() {
    Placement placement = quarterTurn(PLOT, 100, 70, -40);
    assertPoint(new double[] {100, 70, -40}, placement.toWorld(PLOT, 64, PLOT));
    assertPoint(new double[] {100, 70, -41}, placement.toWorld(PLOT + 1, 64, PLOT));
    assertPoint(new double[] {101, 70, -40}, placement.toWorld(PLOT, 64, PLOT + 1));
    assertPoint(new double[] {100, 71, -40}, placement.toWorld(PLOT, 65, PLOT));
  }

  @Test
  void inverseReturnsToTheStorageCell() {
    Placement placement =
        new Placement(-312.25, 96.5, 811.75, 0.1, 0.7, -0.2, 0.68, PLOT + 8, 64, PLOT + 8, 2, 2, 2);
    double[] world = placement.toWorld(PLOT + 13.5, 70.25, PLOT - 4.75);
    assertPoint(
        new double[] {PLOT + 13.5, 70.25, PLOT - 4.75},
        placement.toLocal(world[0], world[1], world[2]));
  }

  @Test
  void normalizesTheRotation() {
    Placement placement = new Placement(0, 0, 0, 0, 2, 0, 2, 0, 0, 0, 1, 1, 1);
    assertPoint(new double[] {0, 0, -1}, placement.toWorld(1, 0, 0));
    assertEquals(HALF, placement.rotationY(), 1e-12);
  }

  @Test
  void keepsSubMillimetrePrecisionTwentyMillionBlocksAway() {
    Placement placement = quarterTurn(PLOT + 0.5, 10.5, 65, 20.5);
    int[] origin = {(int) PLOT, 60, (int) PLOT};
    float[] quad = {0.5f, 4f, 0.5f, 1.5f, 4f, 0.5f, 1.5f, 5f, 0.5f, 0.5f, 5f, 0.5f};
    float[] placed = placement.toCapture(quad, origin, new int[] {10, 64, 20});
    float[] expected = {0.5f, 1, 0.5f, 0.5f, 1, -0.5f, 0.5f, 2, -0.5f, 0.5f, 2, 0.5f};
    for (int index = 0; index < expected.length; index++)
      assertEquals(expected[index], placed[index], 1e-4, "coordinate " + index);
    assertEquals(0.5f, quad[0], "input untouched");
  }

  @Test
  void storageCellsCoverTheDrawnBox() {
    Placement placement = quarterTurn(PLOT, 0, 0, 0);
    CaptureBounds cells = placement.localCells(-2, 10, -3, 4, 12, 1);
    for (double[] corner : new double[][] {{-2, 10, -3}, {4, 12, 1}, {4, 10, -3}, {-2, 12, 1}}) {
      double[] local = placement.toLocal(corner[0], corner[1], corner[2]);
      assertTrue(local[0] >= cells.minX() && local[0] <= cells.maxX() + 1);
      assertTrue(local[1] >= cells.minY() && local[1] <= cells.maxY() + 1);
      assertTrue(local[2] >= cells.minZ() && local[2] <= cells.maxZ() + 1);
    }
    assertEquals(PLOT - 1, cells.minX());
    assertEquals(PLOT + 3, cells.maxX());
  }

  @Test
  void refusesPlacementsThatCannotBeDrawn() {
    assertThrows(
        IllegalArgumentException.class, () -> new Placement(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1));
    assertThrows(
        IllegalArgumentException.class,
        () -> new Placement(Double.NaN, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1));
    assertThrows(
        IllegalArgumentException.class,
        () -> new Placement(0, 0, 0, Double.POSITIVE_INFINITY, 0, 0, 1, 0, 0, 0, 1, 1, 1));
    assertThrows(
        IllegalArgumentException.class, () -> new Placement(0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1));
    assertThrows(
        IllegalArgumentException.class,
        () -> Placement.translation(1e12, 0, 0).localCells(0, 0, 0, 1, 1, 1));
  }

  @Test
  void aMirrorFlipsTheWinding() {
    assertFalse(new Placement(0, 0, 0, 0, 0, 0, 1, 0, 0, 0, -1, 1, 1).keepsWinding());
  }
}
