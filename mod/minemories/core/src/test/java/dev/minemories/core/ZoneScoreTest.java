package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.*;

import dev.minemories.core.ZoneScore.ChunkSignals;
import java.util.List;
import org.junit.jupiter.api.Test;

final class ZoneScoreTest {
  private static final int U = ChunkSignals.UNKNOWN;

  @Test
  void aNaturalVillagelessChunkScoresLowAndABaseScoresHigh() {
    var wilderness = new ChunkSignals(30, 0, 0.0, 0, 0, U);
    var base = new ChunkSignals(5400, 120, 0.45, 12, 20, U);
    assertTrue(ZoneScore.chunk(wilderness) < 0.2, "wilderness " + ZoneScore.chunk(wilderness));
    assertTrue(ZoneScore.chunk(base) > 0.9, "base " + ZoneScore.chunk(base));
    assertEquals(
        1.0, ZoneScore.chunk(new ChunkSignals(1_000_000, 1000, 1.0, 100, 100, 1_000_000)), 1e-9);
  }

  @Test
  void unknownSignalsAreLeftOutAndTheRestRenormalizedInsteadOfCountedAsZero() {
    // Time alone: a long stay is a strong signal even when nothing else is known.
    assertEquals(1.0, ZoneScore.chunk(ChunkSignals.activeOnly(7200)), 1e-9);
    assertEquals(0.0, ZoneScore.chunk(ChunkSignals.activeOnly(0)), 1e-9);
    assertEquals(0.0, ZoneScore.chunk(new ChunkSignals(U, U, U, U, U, U)), 1e-9);
    var known = new ChunkSignals(U, 64, U, U, U, U);
    assertEquals(1.0, ZoneScore.chunk(known), 1e-9);
    // The bonus signal never lowers a score it cannot raise.
    assertEquals(
        ZoneScore.chunk(new ChunkSignals(600, U, U, U, U, U)),
        ZoneScore.chunk(new ChunkSignals(600, U, U, U, U, U)));
  }

  @Test
  void scoresGrowMonotonicallyAndLogarithmicallyWithEachSignal() {
    double previous = -1;
    for (int blockEntities : new int[] {0, 1, 2, 4, 8, 16}) {
      double score = ZoneScore.chunk(new ChunkSignals(U, U, U, blockEntities, U, U));
      assertTrue(score >= previous);
      previous = score;
    }
    assertEquals(1.0, previous, 1e-9);
    // A share below its cap counts linearly, a ratio above saturates.
    assertEquals(0.5, ZoneScore.chunk(new ChunkSignals(U, U, 0.15, U, U, U)), 1e-9);
    assertEquals(1.0, ZoneScore.chunk(new ChunkSignals(U, U, 0.9, U, U, U)), 1e-9);
  }

  @Test
  void aZoneFavoursItsBestChunkWithoutIgnoringTheOthers() {
    assertEquals(0, ZoneScore.zone(List.of()), 0);
    assertEquals(0.6 * 1 + 0.4 * 0.25, ZoneScore.zone(List.of(1.0, 0.0, 0.0, 0.0)), 1e-9);
    assertEquals(0.5, ZoneScore.zone(List.of(0.5, 0.5)), 1e-9);
  }

  @Test
  void theAdvisoryRadiusIsAMultipleOfSixteenBetweenSixteenAndSixtyFour() {
    assertEquals(16, ZoneScore.advisoryRadius(-1));
    assertEquals(16, ZoneScore.advisoryRadius(0.1));
    assertEquals(32, ZoneScore.advisoryRadius(0.4));
    assertEquals(48, ZoneScore.advisoryRadius(0.6));
    assertEquals(64, ZoneScore.advisoryRadius(7));
  }

  @Test
  void blocksPlayersBuildAreToldApartFromGeneratedTerrain() {
    for (String built :
        List.of(
            "minecraft:oak_planks",
            "minecraft:stone_bricks",
            "minecraft:white_wool",
            "create:andesite_casing_stairs",
            "minecraft:chest")) {
      assertTrue(NaturalBlocks.builtByPlayers(built), built);
    }
    for (String natural :
        List.of(
            "minecraft:grass_block",
            "minecraft:stone",
            "minecraft:oak_leaves",
            "minecraft:dirt",
            "fluid#minecraft:water#x",
            "plain")) {
      assertFalse(NaturalBlocks.builtByPlayers(natural), natural);
    }
    assertEquals(
        "minecraft:oak_planks",
        NaturalBlocks.blockId("minecraft:oak_planks / minecraft:block/oak_planks"));
    assertEquals("whole", NaturalBlocks.blockId("whole"));
  }
}
