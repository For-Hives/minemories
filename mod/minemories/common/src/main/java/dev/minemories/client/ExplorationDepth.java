package dev.minemories.client;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;

/** Local, bounded history of the lowest feet position observed in each visited chunk. */
final class ExplorationDepth {
  private static final int MAX_CHUNKS = 100_000;
  private static final long MAX_FILE_BYTES = 8 * 1024 * 1024;
  private final Map<Long, Integer> chunks = new LinkedHashMap<>();
  private boolean dirty;

  static Path historyPath(Path directory, String world, String dimension, String player) {
    // Length prefixes avoid ambiguous concatenation; hashes keep server addresses out of filenames.
    String identity = world.length() + ":" + world + dimension.length() + ":" + dimension + player;
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256").digest(identity.getBytes(StandardCharsets.UTF_8));
      return directory.resolve(HexFormat.of().formatHex(digest) + ".properties");
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException("SHA-256 unavailable", error);
    }
  }

  static ExplorationDepth read(Path path) throws IOException {
    ExplorationDepth history = new ExplorationDepth();
    if (!Files.isRegularFile(path)) return history;
    if (Files.size(path) > MAX_FILE_BYTES)
      throw new IOException("Exploration history exceeds its size limit");
    Properties properties = ClientSettings.read(path);
    for (String key : properties.stringPropertyNames()) {
      if (history.chunks.size() >= MAX_CHUNKS) break;
      try {
        long chunk = Long.parseLong(key);
        history.chunks.put(chunk, Integer.parseInt(properties.getProperty(key)));
      } catch (NumberFormatException ignored) {
        // A damaged entry must not prevent other visited chunks from being recovered.
      }
    }
    return history;
  }

  void record(int blockX, int feetY, int blockZ) {
    long key = chunkKey(Math.floorDiv(blockX, 16), Math.floorDiv(blockZ, 16));
    Integer previous = chunks.get(key);
    if (previous != null && previous <= feetY) return;
    if (previous == null && chunks.size() == MAX_CHUNKS) {
      chunks.remove(chunks.keySet().iterator().next());
    }
    chunks.put(key, feetY);
    dirty = true;
  }

  int captureBottom(int minX, int maxX, int minZ, int maxZ, int feetY, int dimensionBottom) {
    if (maxX < minX || maxZ < minZ || (long) maxX - minX > 256 || (long) maxZ - minZ > 256) {
      throw new IllegalArgumentException(
          "Exploration capture area must fit within 257 × 257 blocks");
    }
    int deepest = feetY;
    for (int z = Math.floorDiv(minZ, 16); z <= Math.floorDiv(maxZ, 16); z++) {
      for (int x = Math.floorDiv(minX, 16); x <= Math.floorDiv(maxX, 16); x++) {
        Integer visited = chunks.get(chunkKey(x, z));
        if (visited != null) deepest = Math.min(deepest, visited);
      }
    }
    // Keep five foundation blocks below the player's feet, without overflowing corrupt/extreme
    // data.
    return (int) Math.max(dimensionBottom, (long) deepest - 5);
  }

  void save(Path path) throws IOException {
    if (!dirty) return;
    Properties properties = new Properties();
    for (var entry : chunks.entrySet()) {
      properties.setProperty(Long.toString(entry.getKey()), Integer.toString(entry.getValue()));
    }
    ClientSettings.save(path, properties);
    dirty = false;
  }

  private static long chunkKey(int x, int z) {
    return ((long) x << 32) | (z & 0xffffffffL);
  }
}
