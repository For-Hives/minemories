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

  private static final CaptureBounds BOX = new CaptureBounds(0, 0, 0, 4, 9, 4);

  private static CutBoundary.Shell shell(CutBoundary.Passable passable) {
    return new CutBoundary.Shell(BOX, passable);
  }

  @Test
  void openAirUnderACanopyOrOverhangAtTheBorderIsNeverSealed() {
    // Ground up to y = 2; a trunk on the plane x = 0 with leaves (passable) on top; a roof slab
    // over x 0..1 at y = 6, open on the other sides.
    var shell =
        shell(
            (x, y, z) -> {
              boolean ground = y <= 2;
              boolean trunk = x == 0 && z == 2 && y >= 3 && y <= 5;
              boolean roof = x <= 1 && y == 6;
              return !(ground || trunk || roof);
            });
    assertFalse(shell.enclosed(0, 4, 0), "beside the trunk, under the roof");
    assertFalse(shell.enclosed(0, 3, 4), "under the roof, far from the trunk");
    assertFalse(shell.enclosed(0, 8, 2), "above the roof");
    assertFalse(shell.enclosed(3, 3, 0), "open air on the z plane");
  }

  @Test
  void aCaveCutByTheBoundaryIsSealedButNotTheAirAboveTheGround() {
    var shell =
        shell(
            (x, y, z) -> {
              boolean ground = y <= 5;
              boolean cave = x <= 2 && z == 2 && y >= 2 && y <= 3;
              return !ground || cave;
            });
    assertTrue(shell.enclosed(0, 2, 2));
    assertTrue(shell.enclosed(0, 3, 2));
    assertFalse(shell.enclosed(0, 7, 2));
    assertFalse(shell.enclosed(4, 6, 4));
  }

  @Test
  void aCaveWithAMouthOnTheShellStaysOpen() {
    var shell =
        shell(
            (x, y, z) -> {
              boolean ground = y <= 5;
              boolean cave = x == 0 && z == 2 && y >= 2 && y <= 5;
              return !ground || cave;
            });
    assertFalse(shell.enclosed(0, 2, 2));
  }

  @Test
  void aFloatingIslandKeepsAnOpenUndersideAndBottom() {
    var shell = shell((x, y, z) -> !(y == 5 && x >= 1 && x <= 3 && z >= 1 && z <= 3));
    assertFalse(shell.enclosed(2, 0, 2));
    assertFalse(shell.enclosed(0, 4, 0));
  }

  @Test
  void aCaptureInsideAClosedSpaceSealsItsCavityConsistently() {
    // Bedrock ceiling at y = 8 and a floor up to y = 1: a Nether-like cavity with no way out.
    var shell = shell((x, y, z) -> y > 1 && y < 8);
    for (int y = 2; y < 8; y++) assertTrue(shell.enclosed(0, y, 2), "side at y=" + y);
    assertTrue(shell.enclosed(4, 5, 4));
  }

  @Test
  void onlyShellCellsInsideTheBoundsCanBeEnclosed() {
    var shell = shell((x, y, z) -> y > 1 && y < 8);
    assertTrue(shell.onShell(0, 3, 2));
    assertTrue(shell.onShell(2, 0, 2));
    assertFalse(shell.onShell(2, 3, 2));
    assertFalse(shell.onShell(-1, 3, 2));
    assertFalse(shell.onShell(2, 10, 2));
    assertFalse(shell.enclosed(2, 3, 2));
  }

  @Test
  void nearestSolidPrefersTheFloorThenTheCeiling() {
    assertEquals(4, CutBoundary.nearestSolid(7, 0, 9, y -> y == 4 || y == 8));
    assertEquals(8, CutBoundary.nearestSolid(7, 5, 9, y -> y == 8));
    assertEquals(Integer.MIN_VALUE, CutBoundary.nearestSolid(7, 0, 9, y -> false));
  }

  @Test
  void fallbackFollowsTheDimension() {
    assertEquals(CutBoundary.Fallback.NETHERRACK, CutBoundary.fallback("minecraft:the_nether", 40));
    assertEquals(CutBoundary.Fallback.END_STONE, CutBoundary.fallback("minecraft:the_end", 40));
    assertEquals(CutBoundary.Fallback.DEEPSLATE, CutBoundary.fallback("minecraft:overworld", -10));
    assertEquals(CutBoundary.Fallback.STONE, CutBoundary.fallback("minecraft:overworld", 10));
    assertEquals(CutBoundary.Fallback.STONE, CutBoundary.fallback("mod:dimension", 10));
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
