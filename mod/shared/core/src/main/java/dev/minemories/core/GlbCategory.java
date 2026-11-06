package dev.minemories.core;

/** What a quad was captured from. Each category becomes its own named glTF node and mesh. */
public enum GlbCategory {
  /** Full opaque cubes: the bulk of the world, usually the last thing to hide. */
  TERRAIN("terrain"),
  /** Non-full block models: plants, snow layers, carpets, slabs, panes. */
  DECOR("decor"),
  FLUIDS("fluids"),
  /** Chests, beds, signs and other block entity renderers. */
  BLOCK_ENTITIES("block_entities"),
  ENTITIES("entities");

  private final String id;

  GlbCategory(String id) {
    this.id = id;
  }

  public String id() {
    return id;
  }
}
