package dev.minemories.core;

/** Rough, local classification of a block id as built by a player rather than generated. */
public final class NaturalBlocks {
  private static final String[] BUILT = {
    "planks",
    "brick",
    "glass",
    "wool",
    "concrete",
    "carpet",
    "stairs",
    "slab",
    "fence",
    "door",
    "trapdoor",
    "torch",
    "lantern",
    "bookshelf",
    "chiseled",
    "polished",
    "smooth",
    "cut_",
    "stained",
    "glazed",
    "lamp",
    "sign",
    "bed",
    "chest",
    "furnace",
    "crafting",
    "table",
    "barrel",
    "ladder",
    "rail",
    "pane",
    "bars",
    "wall",
    "button",
    "pressure_plate",
    "banner",
    "campfire"
  };

  private NaturalBlocks() {}

  /** Block id of a material name written as {@code "namespace:block / texture"}. */
  public static String blockId(String materialName) {
    int cut = materialName.indexOf(" / ");
    return cut < 0 ? materialName : materialName.substring(0, cut);
  }

  public static boolean builtByPlayers(String blockId) {
    String path = blockId.substring(blockId.indexOf(':') + 1);
    if (path.startsWith("fluid#")) return false;
    for (String token : BUILT) if (path.contains(token)) return true;
    return false;
  }
}
