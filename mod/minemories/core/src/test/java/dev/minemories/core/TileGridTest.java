package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

final class TileGridTest {
  @Test
  void defaultsUseEightChunksAndSixteenBlocksPerChunk() {
    assertEquals(new TileGrid(8), TileGrid.defaults());
    assertEquals(128, TileGrid.defaults().tileBlocks());
    assertEquals(256, new TileGrid(16).tileBlocks());
  }

  @Test
  void indexOfFloorsNegativeCoordinatesTowardsMinusInfinity() {
    TileGrid grid = TileGrid.defaults();
    assertEquals(0, grid.indexOf(0));
    assertEquals(0, grid.indexOf(127.9));
    assertEquals(1, grid.indexOf(128));
    assertEquals(-1, grid.indexOf(-0.1));
    assertEquals(-1, grid.indexOf(-128));
    assertEquals(-2, grid.indexOf(-128.1));
  }

  @Test
  void rejectsInvalidTileSizes() {
    assertThrows(IllegalArgumentException.class, () -> new TileGrid(0));
    assertThrows(IllegalArgumentException.class, () -> new TileGrid(17));
  }

  @Test
  void rejectsNonFiniteAndOutOfRangeCoordinates() {
    TileGrid grid = TileGrid.defaults();
    assertThrows(IllegalArgumentException.class, () -> grid.indexOf(Double.NaN));
    assertThrows(IllegalArgumentException.class, () -> grid.indexOf(Double.POSITIVE_INFINITY));
    assertThrows(IllegalArgumentException.class, () -> grid.indexOf(Double.NEGATIVE_INFINITY));
    assertThrows(IllegalArgumentException.class, () -> grid.indexOf(1e12));
    assertThrows(IllegalArgumentException.class, () -> grid.indexOf(-Double.MAX_VALUE));
    assertEquals(2_000_000, grid.indexOf(2_000_000d * 128));
    assertEquals(-2_000_000, grid.indexOf(-2_000_000d * 128));
    assertThrows(IllegalArgumentException.class, () -> grid.indexOf(2_000_001d * 128));
  }

  @Test
  void minBlockMultipliesAndDetectsOverflow() {
    TileGrid grid = TileGrid.defaults();
    assertEquals(0, grid.minBlock(0));
    assertEquals(-384, grid.minBlock(-3));
    assertEquals(256, new TileGrid(16).minBlock(1));
    assertThrows(
        ArithmeticException.class, () -> assertEquals(0, grid.minBlock(Integer.MAX_VALUE)));
  }
}
