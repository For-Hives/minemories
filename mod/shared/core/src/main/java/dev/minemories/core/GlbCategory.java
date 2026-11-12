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
  ENTITIES("entities"),
  /**
   * Geometry the mod invents to close the model (cut walls, floors, ceilings, seals). Kept apart
   * from every real block so a reader can hide, restyle or drop it: its own node and mesh, an
   * {@code extras} marker on the node, and primitives that are never shared with another category.
   * It is not world content, so it does not count in the chunk statistics.
   */
  CUT("minemories:cut");

  private final String id;

  GlbCategory(String id) {
    this.id = id;
  }

  /** Whether this category holds geometry that does not exist in the world. */
  public boolean virtual() {
    return this == CUT;
  }

  /** JSON members appended to the category's node: the marker of virtual geometry, else none. */
  String nodeExtras() {
    return virtual() ? ",\"extras\":{\"minemories\":{\"virtual\":true}}" : "";
  }

  public String id() {
    return id;
  }
}
