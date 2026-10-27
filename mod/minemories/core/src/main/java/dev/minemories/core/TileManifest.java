package dev.minemories.core;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;

/** Deterministic description of the tiles of one capture. */
public record TileManifest(String format, int tileChunks, List<Entry> tiles) {
  public static final String FORMAT = "minemories-tiles-v1";

  public record Entry(
      int x, int z, String file, long offset, long size, String sha256, int quads) {}

  public TileManifest {
    if (!FORMAT.equals(format))
      throw new IllegalArgumentException("Unsupported tile manifest format: " + format);
    if (tileChunks < 1 || tileChunks > TileGrid.MAX_TILE_CHUNKS)
      throw new IllegalArgumentException("tileChunks must be between 1 and 16");
    tiles = List.copyOf(tiles);
  }

  public static String fileName(int x, int z) {
    return "x" + x + "_z" + z + ".glb";
  }

  public long dataBytes() {
    return tiles.stream().mapToLong(Entry::size).sum();
  }

  public String toJson() {
    StringBuilder json =
        new StringBuilder("{\"format\":\"")
            .append(escape(format))
            .append("\",\"tileChunks\":")
            .append(tileChunks)
            .append(",\"tiles\":[");
    for (int i = 0; i < tiles.size(); i++) {
      Entry tile = tiles.get(i);
      if (i > 0) json.append(',');
      json.append("{\"x\":")
          .append(tile.x())
          .append(",\"z\":")
          .append(tile.z())
          .append(",\"file\":\"")
          .append(escape(tile.file()))
          .append("\",\"offset\":")
          .append(tile.offset())
          .append(",\"size\":")
          .append(tile.size())
          .append(",\"sha256\":\"")
          .append(escape(tile.sha256()))
          .append("\",\"quads\":")
          .append(tile.quads())
          .append('}');
    }
    return json.append("]}").toString();
  }

  static String sha256(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException("SHA-256 is required by the Java platform", impossible);
    }
  }

  private static String escape(String value) {
    return value.replace("\\", "\\\\").replace("\"", "\\\"");
  }
}
