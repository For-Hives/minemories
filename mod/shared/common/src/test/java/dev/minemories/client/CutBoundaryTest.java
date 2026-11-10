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

  @Test
  void sealsOnlyEmptyCellsFromBothSides() {
    assertTrue(CutBoundary.sealsBothSides(true, false));
    assertTrue(CutBoundary.sealsBothSides(false, true));
    assertFalse(CutBoundary.sealsBothSides(false, false));
  }

  @Test
  void reversedSealFacesTheOtherWayWithTheTextureInPlace() {
    // A floor quad facing down (the outward side of a cut at the bottom of the capture).
    float[] xyz = {0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1};
    float[] uv = {0, 0, 1, 0, 1, 1, 0, 1};
    float[] back = new float[12], backUv = new float[8];
    CutBoundary.reverse(xyz, uv, back, backUv);
    float[] front = normal(xyz), flipped = normal(back);
    for (int axis = 0; axis < 3; axis++) assertEquals(-front[axis], flipped[axis], 1e-6f);
    assertNotEquals(0, front[1], 1e-6f);
    // Every corner keeps its own texture coordinates.
    for (int corner = 0; corner < 4; corner++) {
      int source = (4 - corner) % 4;
      for (int axis = 0; axis < 3; axis++)
        assertEquals(xyz[source * 3 + axis], back[corner * 3 + axis]);
      for (int axis = 0; axis < 2; axis++)
        assertEquals(uv[source * 2 + axis], backUv[corner * 2 + axis]);
    }
    // The source arrays are left untouched.
    assertArrayEquals(new float[] {0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1}, xyz);
  }

  private static float[] normal(float[] q) {
    float ax = q[3] - q[0], ay = q[4] - q[1], az = q[5] - q[2];
    float bx = q[6] - q[0], by = q[7] - q[1], bz = q[8] - q[2];
    return new float[] {ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx};
  }
}
