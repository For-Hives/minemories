package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class BuildDepthTest {
  private static BuildDepth.Builds builds(int bottom) {
    return new BuildDepth.Builds(bottom, -64);
  }

  @Test
  void withoutBuildsTheAutomaticBottomStays() {
    assertEquals(59, builds(59).bottom());
  }

  @Test
  void furnitureStandingOnTheCutBringsItsFloorIn() {
    // The reported cave: the capture cut at y 59, workbenches and bulbs at 59 to 61, its floor at
    // 58 left out.
    var builds = builds(59);
    builds.blockEntity(14, 143, 59);
    builds.light(14, 143, 61);
    assertEquals(54, builds.bottom());
  }

  @Test
  void aBuildAboveTheCutKeepsTheBottomWhenItAlreadyHasItsFoundation() {
    var builds = builds(59);
    builds.light(0, 0, 65);
    assertEquals(59, builds.bottom());
  }

  @Test
  void aCellarOfBlockEntitiesChainsDownThroughNeighbouringChunks() {
    // The reported base: furniture at the cut, then barrels and machines down to y 46, drifting one
    // chunk sideways on the way.
    var builds = builds(59);
    builds.blockEntity(14, 143, 59);
    builds.blockEntity(14, 143, 54);
    builds.blockEntity(15, 143, 50);
    builds.blockEntity(15, 142, 46);
    assertEquals(41, builds.bottom());
  }

  @Test
  void torchesAloneDoNotFollowAMineDown() {
    var builds = builds(59);
    for (int y = 59; y >= 0; y -= 4) builds.light(3, 3, y);
    // Only the torches near the cut count.
    assertEquals(55 - BuildDepth.FOUNDATION, builds.bottom());
  }

  @Test
  void aBuildFarBelowOrInAnotherPartOfTheAreaIsNotConnected() {
    var far = builds(59);
    far.blockEntity(0, 0, 59);
    far.blockEntity(0, 0, 20);
    assertEquals(54, far.bottom());
    // Close in height to a joined chest but two chunks away from it.
    var aside = builds(59);
    aside.blockEntity(0, 0, 59);
    aside.blockEntity(0, 0, 54);
    aside.blockEntity(2, 0, 50);
    assertEquals(49, aside.bottom());
    // Just past the gap below the last joined layer.
    var gap = builds(59);
    gap.blockEntity(0, 0, 59);
    gap.blockEntity(0, 0, 59 - BuildDepth.GAP - 1);
    assertEquals(54, gap.bottom());
  }

  @Test
  void aRowOfBlockEntitiesJoinsThroughItself() {
    var builds = builds(59);
    // The row is reached from its far end (chunk 3), while a HashSet walks chunks 0 to 3: each
    // barrel only joins once its neighbour has, which takes several passes over the layer.
    builds.blockEntity(3, 0, 59);
    builds.blockEntity(3, 0, 54);
    for (int x = 0; x <= 3; x++) builds.blockEntity(x, 0, 50);
    builds.blockEntity(0, 0, 45);
    assertEquals(40, builds.bottom());
  }

  @Test
  void blockEntitiesOutsideTheScanAndLightsOutsideTheBandAreIgnored() {
    // Nothing touches the cut: a block entity above the band and a light below it do not count.
    var outside = builds(59);
    outside.blockEntity(0, 0, 59 + BuildDepth.GAP + 1);
    outside.light(0, 0, 59 - BuildDepth.GAP - 1);
    assertEquals(59, outside.bottom());
    // A chain reaching the scan floor stops there: the block entity under it is ignored.
    var floor = builds(59);
    for (int y = 59; y >= 59 - BuildDepth.MAX_EXTRA; y -= BuildDepth.GAP)
      floor.blockEntity(0, 0, y);
    floor.blockEntity(0, 0, 59 - BuildDepth.MAX_EXTRA - 1);
    assertEquals(59 - 60 - BuildDepth.FOUNDATION, floor.bottom());
  }

  @Test
  void aBlockEntityJoinsAtExactlyTheGapBelowAJoinedOneAndNotOneLayerFurther() {
    var atGap = builds(59);
    atGap.blockEntity(0, 0, 53);
    atGap.blockEntity(1, 1, 53 - BuildDepth.GAP);
    assertEquals(53 - BuildDepth.GAP - BuildDepth.FOUNDATION, atGap.bottom());
    var past = builds(59);
    past.blockEntity(0, 0, 53);
    past.blockEntity(0, 0, 53 - BuildDepth.GAP - 1);
    assertEquals(53 - BuildDepth.FOUNDATION, past.bottom());
  }

  @Test
  void theDeepestLayerIsCappedAndTheDimensionFloorHolds() {
    var deep = builds(100);
    for (int y = 100; y >= 100 - BuildDepth.MAX_EXTRA - 10; y--) deep.blockEntity(0, 0, y);
    assertEquals(100 - BuildDepth.MAX_EXTRA - BuildDepth.FOUNDATION, deep.bottom());
    var floor = builds(-60);
    floor.blockEntity(0, 0, -60);
    floor.blockEntity(0, 0, -64);
    assertEquals(-64, floor.bottom());
  }

  @Test
  void extremeHeightsDoNotOverflow() {
    assertEquals(
        Integer.MIN_VALUE, BuildDepth.scanBottom(Integer.MIN_VALUE + 3, Integer.MIN_VALUE));
    assertEquals(
        Integer.MIN_VALUE, BuildDepth.lightBottom(Integer.MIN_VALUE + 3, Integer.MIN_VALUE));
    assertEquals(Integer.MAX_VALUE, BuildDepth.scanTop(Integer.MAX_VALUE - 2));
    var builds = new BuildDepth.Builds(Integer.MIN_VALUE + 2, Integer.MIN_VALUE);
    builds.blockEntity(-1, -1, Integer.MIN_VALUE + 1);
    builds.blockEntity(-1, -1, Integer.MIN_VALUE);
    assertEquals(Integer.MIN_VALUE, builds.bottom());
  }

  @Test
  void naturalLightsAndBlockEntitiesDoNotCountAsBuilds() {
    for (String placed :
        new String[] {
          "torch",
          "wall_torch",
          "lantern",
          "luphie_caged_bulb",
          "sea_lantern",
          "campfire",
          "reactor_core",
          "ochre_froglight"
        }) assertTrue(BuildDepth.builtLight(placed), placed);
    for (String natural :
        new String[] {
          "fire",
          "soul_fire",
          "lava",
          "glow_lichen",
          "amethyst_cluster",
          "cave_vines_plant",
          "glowstone",
          "deepslate_redstone_ore",
          "sculk_catalyst",
          "glowing_mushroom",
          "nether_portal",
          "magma_block"
        }) assertFalse(BuildDepth.builtLight(natural), natural);
    for (String placed :
        new String[] {"chest", "barrel", "furnace", "oak_sign", "red_bed", "limited_barrel_4"})
      assertTrue(BuildDepth.builtBlockEntity(placed), placed);
    for (String natural :
        new String[] {
          "spawner",
          "trial_spawner",
          "vault",
          "sculk_shrieker",
          "bee_nest",
          "suspicious_sand",
          "end_portal",
          "decorated_pot",
          "budding_amethyst",
          "lootr_chest"
        }) assertFalse(BuildDepth.builtBlockEntity(natural), natural);
  }
}
