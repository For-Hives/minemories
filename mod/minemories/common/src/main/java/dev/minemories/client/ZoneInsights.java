package dev.minemories.client;

import dev.minemories.core.ChunkStats;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

/**
 * What past captures showed about each chunk (player-built share, block entities, lights, content
 * fingerprint), bounded and kept only on this device next to the zone history. It feeds suggestions
 * and tells the next capture which chunks did not change; nothing is sent anywhere, before or after
 * pairing.
 */
final class ZoneInsights {
  static final int MAX_CHUNKS = 10_000;
  static final int MAX_CHANGES = 1000;

  /**
   * A block entity renderer emits a few dozen quads; this converts the quad count into a rough
   * count.
   */
  static final int QUADS_PER_BLOCK_ENTITY = 24;

  /**
   * {@code entityQuads} and {@code inhabitedTicks} are -1 when unknown (files written by earlier
   * versions, or no integrated server); {@code changes} counts the captures that found this chunk
   * different from the previous one.
   */
  record Chunk(
      int builtPerMille,
      int blockEntities,
      int lights,
      long fingerprint,
      int entityQuads,
      long inhabitedTicks,
      int changes) {
    Chunk(int builtPerMille, int blockEntities, int lights, long fingerprint) {
      this(builtPerMille, blockEntities, lights, fingerprint, -1, -1, 0);
    }
  }

  /**
   * How many chunks a capture covered, how many differ from the previous capture of the same chunk,
   * how many are new, and in how many the number of creature quads moved. A capture where none of
   * that happened shows nothing new.
   */
  record Merge(int total, int changed, int fresh, int creaturesMoved) {
    boolean identical() {
      return total > 0 && changed == 0 && fresh == 0 && creaturesMoved == 0;
    }
  }

  private final Map<Long, Chunk> chunks = new LinkedHashMap<>();
  private boolean dirty;

  private static long key(int x, int z) {
    return ((long) x << 32) | (z & 0xffffffffL);
  }

  Chunk chunk(int chunkX, int chunkZ) {
    return chunks.get(key(chunkX, chunkZ));
  }

  /** Remembers the integrated server's inhabited time of a chunk already described by a capture. */
  void inhabited(int chunkX, int chunkZ, long ticks) {
    long key = key(chunkX, chunkZ);
    Chunk chunk = chunks.get(key);
    if (chunk == null || ticks < 0 || chunk.inhabitedTicks() == ticks) return;
    chunks.put(
        key,
        new Chunk(
            chunk.builtPerMille(),
            chunk.blockEntities(),
            chunk.lights(),
            chunk.fingerprint(),
            chunk.entityQuads(),
            ticks,
            chunk.changes()));
    dirty = true;
  }

  int size() {
    return chunks.size();
  }

  /**
   * Records a finished capture; {@code origin} is the absolute block position its chunks are
   * relative to.
   */
  Merge merge(int originX, int originZ, List<ChunkStats.Chunk> captured) {
    int changed = 0, fresh = 0, moved = 0;
    int baseX = Math.floorDiv(originX, 16), baseZ = Math.floorDiv(originZ, 16);
    for (ChunkStats.Chunk chunk : captured) {
      long key = key(baseX + chunk.chunkX(), baseZ + chunk.chunkZ());
      Chunk previous = chunks.remove(key);
      boolean differs = previous != null && previous.fingerprint() != chunk.fingerprint();
      Chunk next =
          new Chunk(
              (int) Math.round(chunk.builtShare() * 1000),
              (chunk.blockEntityQuads() + QUADS_PER_BLOCK_ENTITY - 1) / QUADS_PER_BLOCK_ENTITY,
              chunk.lights(),
              chunk.fingerprint(),
              chunk.entityQuads(),
              previous == null ? -1 : previous.inhabitedTicks(),
              Math.min(
                  MAX_CHANGES, (previous == null ? 0 : previous.changes()) + (differs ? 1 : 0)));
      if (previous == null) fresh++;
      else if (differs) changed++;
      // An unknown earlier count (older file) is treated as a move: nothing is skipped on a guess.
      if (previous != null && previous.entityQuads() != chunk.entityQuads()) moved++;
      if (previous == null && chunks.size() >= MAX_CHUNKS) {
        chunks.remove(chunks.keySet().iterator().next());
      }
      chunks.put(key, next);
      dirty = true;
    }
    return new Merge(captured.size(), changed, fresh, moved);
  }

  static ZoneInsights read(Path path) throws IOException {
    ZoneInsights insights = new ZoneInsights();
    if (!Files.exists(path, LinkOption.NOFOLLOW_LINKS)) return insights;
    if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) || Files.size(path) > 2 * 1024 * 1024)
      throw new IOException("Invalid or oversized zone insights");
    Properties data = ClientSettings.read(path);
    for (String name : data.stringPropertyNames()) {
      if (insights.chunks.size() >= MAX_CHUNKS) break;
      try {
        long packed = Long.parseLong(name);
        String[] fields = data.getProperty(name).split(",");
        int built = Integer.parseInt(fields[0]);
        int entities = Integer.parseInt(fields[1]);
        int lights = Integer.parseInt(fields[2]);
        long fingerprint = Long.parseUnsignedLong(fields[3], 16);
        // Files written before creature counts, inhabited time and change counters have four
        // fields.
        int creatures = fields.length > 4 ? Integer.parseInt(fields[4]) : -1;
        long inhabited = fields.length > 5 ? Long.parseLong(fields[5]) : -1;
        int changes = fields.length > 6 ? Integer.parseInt(fields[6]) : 0;
        if (built >= 0
            && built <= 1000
            && entities >= 0
            && lights >= 0
            && lights <= 100_000
            && creatures >= -1
            && inhabited >= -1
            && changes >= 0
            && changes <= MAX_CHANGES) {
          insights.chunks.put(
              packed,
              new Chunk(built, entities, lights, fingerprint, creatures, inhabited, changes));
        }
      } catch (NumberFormatException | ArrayIndexOutOfBoundsException ignored) {
        // Recover the other entries from a damaged local file.
      }
    }
    return insights;
  }

  void save(Path path) throws IOException {
    if (!dirty) return;
    Properties data = new Properties();
    for (var entry : chunks.entrySet()) {
      Chunk chunk = entry.getValue();
      data.setProperty(
          entry.getKey().toString(),
          chunk.builtPerMille()
              + ","
              + chunk.blockEntities()
              + ","
              + chunk.lights()
              + ","
              + Long.toHexString(chunk.fingerprint())
              + ","
              + chunk.entityQuads()
              + ","
              + chunk.inhabitedTicks()
              + ","
              + chunk.changes());
    }
    ClientSettings.save(path, data);
    dirty = false;
  }
}
