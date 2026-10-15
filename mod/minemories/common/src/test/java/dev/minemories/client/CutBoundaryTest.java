package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class CutBoundaryTest {
  @Test
  void filtersOnlyQuadsCoincidentWithTheCutPlane() {
    float[] face = {0, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1};
    assertTrue(CutBoundary.onPlane(face, 0, 0));
    assertFalse(CutBoundary.onPlane(face, 0, 1));
    assertFalse(CutBoundary.onPlane(face, 1, 0));
    assertFalse(CutBoundary.onPlane(face, -1, 0));
    assertFalse(CutBoundary.onPlane(new float[0], 0, 0));
    assertFalse(CutBoundary.onPlane(face, 0, Float.NaN));
    face[0] = Float.POSITIVE_INFINITY;
    assertFalse(CutBoundary.onPlane(face, 0, 0));
  }

  @Test
  void onlyExportBoundsDecideWhichNeighborsAreOutside() {
    var bounds = new CaptureBounds(-3, -20, -4, 3, 80, 4);
    assertFalse(CutBoundary.outside(bounds, -3, -20, -4));
    assertFalse(CutBoundary.outside(bounds, 3, 80, 4));
    int[][] neighbors = {{-4, 0, 0}, {4, 0, 0}, {0, -21, 0}, {0, 81, 0}, {0, 0, -5}, {0, 0, 5}};
    for (int[] p : neighbors) assertTrue(CutBoundary.outside(bounds, p[0], p[1], p[2]));
  }

  @Test
  void closesSolidSectionsCavesAndUndergroundFluidsWithoutCoveringTheSurface() {
    assertEquals(CutBoundary.Material.STONE, CutBoundary.material(20, 64, true, false, false));
    assertEquals(CutBoundary.Material.STONE, CutBoundary.material(20, 64, false, true, false));
    assertEquals(CutBoundary.Material.STONE, CutBoundary.material(60, 64, false, false, true));
    assertEquals(CutBoundary.Material.DIRT, CutBoundary.material(61, 64, true, false, false));
    assertEquals(CutBoundary.Material.NONE, CutBoundary.material(64, 64, false, false, true));
    assertEquals(CutBoundary.Material.NONE, CutBoundary.material(70, 64, true, false, false));
    assertEquals(CutBoundary.Material.NONE, CutBoundary.material(20, 64, false, false, false));
    assertEquals(
        CutBoundary.Material.STONE,
        CutBoundary.material(Integer.MIN_VALUE, Integer.MAX_VALUE, true, false, false));
  }
}
