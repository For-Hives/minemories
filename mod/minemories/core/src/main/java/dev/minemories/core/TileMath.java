package dev.minemories.core;

/** Shared routing math: which tile owns a quad or light, and its tile-local coordinates. */
final class TileMath {
  private TileMath() {}

  record Tile(int x, int z) {}

  static Tile quadTile(TileGrid grid, int originX, int originZ, float[] xyz) {
    return tileAt(
        grid,
        originX + ((double) xyz[0] + xyz[3] + xyz[6] + xyz[9]) / 4.0,
        originZ + ((double) xyz[2] + xyz[5] + xyz[8] + xyz[11]) / 4.0);
  }

  static Tile tileAt(TileGrid grid, double worldX, double worldZ) {
    return new Tile(grid.indexOf(worldX), grid.indexOf(worldZ));
  }

  static float[] localQuad(
      TileGrid grid, int originX, int originY, int originZ, Tile tile, float[] xyz) {
    float[] local = new float[12];
    for (int i = 0; i < 4; i++) {
      float[] point =
          localPoint(
              grid, originX, originY, originZ, tile, xyz[i * 3], xyz[i * 3 + 1], xyz[i * 3 + 2]);
      System.arraycopy(point, 0, local, i * 3, 3);
    }
    return local;
  }

  static float[] localPoint(
      TileGrid grid, int originX, int originY, int originZ, Tile tile, float x, float y, float z) {
    return new float[] {
      (float) ((double) originX + x - grid.minBlock(tile.x())),
      (float) ((double) originY + y),
      (float) ((double) originZ + z - grid.minBlock(tile.z()))
    };
  }
}
