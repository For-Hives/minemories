package dev.minemories.core;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Per-chunk facts gathered while a capture is written, relative to the chunk of the capture origin:
 * how many quads look player-built, how many belong to block entities, how many lights, and a
 * fingerprint of the content. The fingerprint is independent of the capture origin and of the order
 * quads arrive in, so two captures of the same place agree on every chunk that did not change, and
 * entities (which move) are left out. It is a change detector, not a proof: it is built from sums
 * and second moments of the quad centres, shifted to absolute coordinates once the origin is known.
 * Nothing here leaves the device by itself.
 */
public final class ChunkStats {
  static final int MAX_CHUNKS = 4096;

  /** Centres are kept in sixteenths of a block, the grid Minecraft models sit on. */
  private static final double FIXED = 16;

  /** One chunk column. */
  public record Chunk(
      int chunkX,
      int chunkZ,
      int quads,
      int builtQuads,
      int blockEntityQuads,
      int lights,
      long fingerprint,
      int entityQuads) {
    public double builtShare() {
      return quads == 0 ? 0 : (double) builtQuads / quads;
    }
  }

  private static final class Counters {
    int quads, built, blockEntities, lights, fixed, entities;
    long shapes;
    final long[] sum = new long[3], square = new long[3];
  }

  private final Map<Long, Counters> chunks = new LinkedHashMap<>();
  private final Map<String, Boolean> builtCache = new LinkedHashMap<>();

  private static long key(int x, int z) {
    return ((long) x << 32) | (z & 0xffffffffL);
  }

  private Counters counters(int chunkX, int chunkZ) {
    if (chunkX == ChunkRuns.NONE || chunkZ == ChunkRuns.NONE) return null;
    long key = key(chunkX, chunkZ);
    Counters found = chunks.get(key);
    if (found == null && chunks.size() < MAX_CHUNKS) {
      found = new Counters();
      chunks.put(key, found);
    }
    return found;
  }

  void quad(GlbCategory category, int chunkX, int chunkZ, String materialName, float[] xyz) {
    Counters counters = counters(chunkX, chunkZ);
    if (counters == null) return;
    counters.quads++;
    if (category == GlbCategory.BLOCK_ENTITIES) counters.blockEntities++;
    boolean built =
        builtCache.computeIfAbsent(
            materialName, name -> NaturalBlocks.builtByPlayers(NaturalBlocks.blockId(name)));
    if (built) counters.built++;
    // Moving creatures would make every chunk look changed: they are only counted, not
    // fingerprinted.
    if (category == GlbCategory.ENTITIES) {
      counters.entities++;
      return;
    }
    counters.fixed++;
    long shape = mix(materialName.hashCode() * 31L + category.ordinal());
    // Shape: the corner offsets from the first corner, so it does not depend on where the quad
    // sits.
    for (int index = 3; index < 12; index++) {
      shape = mix(shape ^ Math.round((xyz[index] - xyz[index % 3]) * FIXED));
    }
    counters.shapes += shape;
    for (int axis = 0; axis < 3; axis++) {
      double centre = (xyz[axis] + xyz[3 + axis] + xyz[6 + axis] + xyz[9 + axis]) / 4;
      long value = Math.round(centre * FIXED);
      counters.sum[axis] += value;
      counters.square[axis] += value * value;
    }
  }

  void light(int chunkX, int chunkZ) {
    Counters counters = counters(chunkX, chunkZ);
    if (counters != null) counters.lights++;
  }

  private static long mix(long value) {
    long hash = value * 0x9E3779B97F4A7C15L;
    hash ^= hash >>> 29;
    hash *= 0xBF58476D1CE4E5B9L;
    return hash ^ (hash >>> 32);
  }

  /**
   * The fingerprint with positions shifted to absolute block coordinates of the given capture
   * origin.
   */
  private static long fingerprint(Counters counters, int chunkX, int chunkZ, int[] origin) {
    long[] shift = {
      Math.round((Math.floorMod(origin[0], 16) - 16.0 * chunkX) * FIXED),
      Math.round(origin[1] * FIXED),
      Math.round((Math.floorMod(origin[2], 16) - 16.0 * chunkZ) * FIXED)
    };
    long hash = mix(counters.fixed) ^ counters.shapes;
    for (int axis = 0; axis < 3; axis++) {
      long first = counters.sum[axis] + counters.fixed * shift[axis];
      long second =
          counters.square[axis]
              + 2 * shift[axis] * counters.sum[axis]
              + counters.fixed * shift[axis] * shift[axis];
      hash = mix(hash ^ first) + mix(second + axis);
    }
    return hash;
  }

  /** Everything collected so far, fingerprints relative to an origin at (0, 0, 0). */
  public List<Chunk> snapshot() {
    return snapshot(0, 0, 0);
  }

  /**
   * {@code originX/Y/Z} is the absolute block position the capture's coordinates are relative to.
   */
  public List<Chunk> snapshot(int originX, int originY, int originZ) {
    int[] origin = {originX, originY, originZ};
    List<Chunk> result = new ArrayList<>();
    for (Map.Entry<Long, Counters> entry : chunks.entrySet()) {
      Counters counters = entry.getValue();
      int chunkX = (int) (entry.getKey() >> 32), chunkZ = (int) (long) entry.getKey();
      result.add(
          new Chunk(
              chunkX,
              chunkZ,
              counters.quads,
              counters.built,
              counters.blockEntities,
              counters.lights,
              fingerprint(counters, chunkX, chunkZ, origin),
              counters.entities));
    }
    return List.copyOf(result);
  }
}
