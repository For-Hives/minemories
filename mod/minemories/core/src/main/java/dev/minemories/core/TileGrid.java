package dev.minemories.core;

/** Absolute, world-anchored square tile grid expressed in whole Minecraft chunks. */
public record TileGrid(int tileChunks) {
  public static final int DEFAULT_TILE_CHUNKS = 8;
  public static final int MAX_TILE_CHUNKS = 16;
  private static final int MAX_INDEX = 2_000_000;

  public TileGrid {
    if (tileChunks < 1 || tileChunks > MAX_TILE_CHUNKS)
      throw new IllegalArgumentException("tileChunks must be between 1 and " + MAX_TILE_CHUNKS);
  }

  public static TileGrid defaults() {
    return new TileGrid(DEFAULT_TILE_CHUNKS);
  }

  public int tileBlocks() {
    return 16 * tileChunks;
  }

  public int indexOf(double worldCoordinate) {
    if (!Double.isFinite(worldCoordinate))
      throw new IllegalArgumentException("World coordinate must be finite");
    double index = Math.floor(worldCoordinate / tileBlocks());
    if (Math.abs(index) > MAX_INDEX)
      throw new IllegalArgumentException("Tile index is outside the supported range");
    return (int) index;
  }

  public int minBlock(int index) {
    return Math.multiplyExact(index, tileBlocks());
  }
}
