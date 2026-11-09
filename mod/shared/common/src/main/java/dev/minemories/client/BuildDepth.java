package dev.minemories.client;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Lowers an automatic capture bottom through the builds that reach it, so a cave base, a cellar or
 * a storage room under the visited depth is kept whole, without following every lit mine tunnel or
 * jumping to a build far below.
 *
 * <ul>
 *   <li>A build touches the cut when a placed light source or a block entity stands within {@link
 *       #GAP} layers of it (furniture on a cave floor the cut leaves out).
 *   <li>From there, only block entities (chests, barrels, furnaces, machines…) carry the build
 *       further down: each one must sit at most {@link #GAP} layers below a cell already joined, in
 *       the same chunk or a neighbouring one. Torches alone light mines and do not.
 *   <li>Nothing below {@link #MAX_EXTRA} layers under the automatic bottom counts, and {@link
 *       #FOUNDATION} blocks are kept under the lowest joined layer.
 * </ul>
 */
final class BuildDepth {
  /** Layers a build may skip, and the band around the cut where it touches it. */
  static final int GAP = 6;

  /** Deepest built layer that can count, in layers below the automatic bottom. */
  static final int MAX_EXTRA = 64;

  /** Blocks kept under the lowest built layer, like under the player's feet. */
  static final int FOUNDATION = 5;

  /**
   * Light sources that worlds generate on their own (lava, glow lichen, amethyst, glowing ores,
   * sculk, modded glowing plants…): matched on the block id's path, so a modded "glowing_mushroom"
   * or "ruby_ore" counts as natural too.
   */
  private static final String[] NATURAL_LIGHTS = {
    "lava",
    "magma",
    "lichen",
    "amethyst",
    "cave_vines",
    "glow",
    "mushroom",
    "sculk",
    "_ore",
    "sea_pickle",
    "crystal",
    "shroomlight",
    "crying_obsidian",
    "portal",
    "end_gateway"
  };

  /**
   * Block entities that worlds generate on their own: spawners, sculk, bee nests, ruins, geodes and
   * structure loot (Lootr's chests among them).
   */
  private static final String[] NATURAL_BLOCK_ENTITIES = {
    "spawner",
    "vault",
    "sculk",
    "bee_nest",
    "suspicious",
    "end_gateway",
    "end_portal",
    "decorated_pot",
    "amethyst",
    "loot"
  };

  private BuildDepth() {}

  /** Lowest layer to scan for block entities (inclusive). */
  static int scanBottom(int bottom, int dimensionBottom) {
    return (int) Math.max(dimensionBottom, (long) bottom - MAX_EXTRA);
  }

  /** Lowest layer to scan for light sources (inclusive): they only count at the cut. */
  static int lightBottom(int bottom, int dimensionBottom) {
    return (int) Math.max(dimensionBottom, (long) bottom - GAP);
  }

  /** Highest layer to scan for both (inclusive). */
  static int scanTop(int bottom) {
    return (int) Math.min(Integer.MAX_VALUE, (long) bottom + GAP);
  }

  /** A placed light source, judged on its block id's path (lowercase). */
  static boolean builtLight(String blockPath) {
    // Fire spreads and lava lights it; a campfire is placed.
    if (blockPath.equals("fire") || blockPath.equals("soul_fire")) return false;
    return !matches(blockPath, NATURAL_LIGHTS);
  }

  /** A placed block entity (chest, barrel, furnace, sign, bed…), judged on its block's path. */
  static boolean builtBlockEntity(String blockPath) {
    return !matches(blockPath, NATURAL_BLOCK_ENTITIES);
  }

  private static boolean matches(String blockPath, String[] words) {
    for (String word : words) if (blockPath.contains(word)) return true;
    return false;
  }

  /** The built cells found around and under an automatic bottom, by chunk and layer. */
  static final class Builds {
    private final int bottom;
    private final int dimensionBottom;
    private final Map<Integer, Set<Long>> touching = new HashMap<>();
    private final Map<Integer, Set<Long>> blockEntities = new HashMap<>();

    Builds(int bottom, int dimensionBottom) {
      this.bottom = bottom;
      this.dimensionBottom = dimensionBottom;
    }

    /** A placed light source; ignored outside the band around the cut. */
    void light(int chunkX, int chunkZ, int y) {
      if (y >= lightBottom(bottom, dimensionBottom) && y <= scanTop(bottom))
        touching.computeIfAbsent(y, key -> new HashSet<>()).add(chunk(chunkX, chunkZ));
    }

    /** A placed block entity; ignored outside the scanned layers. */
    void blockEntity(int chunkX, int chunkZ, int y) {
      if (y < scanBottom(bottom, dimensionBottom) || y > scanTop(bottom)) return;
      blockEntities.computeIfAbsent(y, key -> new HashSet<>()).add(chunk(chunkX, chunkZ));
      light(chunkX, chunkZ, y);
    }

    /** The lowered bottom, or the automatic one when no build touches the cut. */
    int bottom() {
      if (touching.isEmpty()) return bottom;
      Map<Integer, Set<Long>> joined = new HashMap<>(touching);
      long lowest = Long.MAX_VALUE;
      for (int y : touching.keySet()) lowest = Math.min(lowest, y);
      // long, so the walk cannot wrap around at the lowest int.
      for (long y = (long) lightBottom(bottom, dimensionBottom) - 1;
          y >= scanBottom(bottom, dimensionBottom);
          y--) {
        if (lowest - y > GAP) break;
        Set<Long> cells = blockEntities.get((int) y);
        if (cells == null) continue;
        Set<Long> layer = joinedCells(joined, cells, (int) y);
        if (layer.isEmpty()) continue;
        joined.put((int) y, layer);
        lowest = y;
      }
      return (int) Math.min(bottom, Math.max(dimensionBottom, lowest - FOUNDATION));
    }

    /** The cells of one layer that join the build; a row of barrels joins through itself. */
    private static Set<Long> joinedCells(Map<Integer, Set<Long>> joined, Set<Long> cells, int y) {
      Set<Long> layer = new HashSet<>();
      for (boolean grew = true; grew; ) {
        grew = false;
        for (long cell : cells)
          if (!layer.contains(cell) && touches(joined, layer, cell, y)) {
            layer.add(cell);
            grew = true;
          }
      }
      return layer;
    }

    private static boolean touches(
        Map<Integer, Set<Long>> joined, Set<Long> layer, long cell, int y) {
      int chunkX = (int) (cell >> 32), chunkZ = (int) cell;
      for (int dz = -1; dz <= 1; dz++)
        for (int dx = -1; dx <= 1; dx++) {
          long neighbour = chunk(chunkX + dx, chunkZ + dz);
          if (layer.contains(neighbour)) return true;
          for (int above = 1; above <= GAP; above++) {
            Set<Long> cells = joined.get(y + above);
            if (cells != null && cells.contains(neighbour)) return true;
          }
        }
      return false;
    }

    private static long chunk(int chunkX, int chunkZ) {
      return ((long) chunkX << 32) | (chunkZ & 0xffffffffL);
    }
  }
}
