package dev.minemories.gametest;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/** What every loader's in-game capture test checks in the exported GLB, and the world it builds. */
public final class GlbReport {
  /** The tall-grass plant block: "grass" before Minecraft 1.20.3 (pass -Dminemories.gametest.grass=grass). */
  public static final String GRASS = System.getProperty("minemories.gametest.grass", "short_grass");

  /** Server commands that build the test scene around the player at (0, -60, 0) in a flat world. */
  public static final String[] SCENE = {
    "tp @p 0 -60 0",
    "setblock 2 -61 0 minecraft:stone",
    "setblock 2 -60 0 minecraft:stone",
    "setblock 3 -60 0 minecraft:red_stained_glass",
    "setblock 4 -60 0 minecraft:oak_leaves[persistent=true]", // placed leaves with no log nearby would decay
    "setblock 5 -60 0 minecraft:grass_block",
    "setblock 5 -59 0 minecraft:" + GRASS,
    "setblock 6 -60 0 minecraft:chest",
    "setblock 7 -60 0 minecraft:water",
    "setblock -3 -60 0 minecraft:torch",
    "summon minecraft:cow 3 -60 3 {NoAI:1b}",
    "summon minecraft:armor_stand 5 -60 3",
    "setblock 9 -60 0 minecraft:end_portal", // shader-only surfaces: baked by EndPortalLook
    "setblock 10 -60 0 minecraft:end_gateway",
    // A pocket of air on the edge of the export (radius 12): its seal must also face inwards.
    "setblock 12 -62 0 minecraft:air"
  };

  public static final String EXPORT_COMMAND = "minemories export 12";

  private GlbReport() {}

  public static Path exportedGlb() {
    return Path.of(System.getProperty("user.home"), "export", "capture.glb");
  }

  public static void report(Path glb) throws IOException {
    ByteBuffer data = ByteBuffer.wrap(Files.readAllBytes(glb)).order(ByteOrder.LITTLE_ENDIAN);
    if (data.getInt(0) != 0x46546C67) throw new AssertionError("Pas un GLB");
    int jsonLength = data.getInt(12);
    String json = new String(data.array(), 20, jsonLength, StandardCharsets.UTF_8);
    JsonObject root = JsonParser.parseString(json).getAsJsonObject();
    int meshes = root.getAsJsonArray("meshes").size();
    int materials = root.has("materials") ? root.getAsJsonArray("materials").size() : 0;
    int images = root.has("images") ? root.getAsJsonArray("images").size() : 0;
    int nodes = root.has("nodes") ? root.getAsJsonArray("nodes").size() : 0;
    Path summary = glb.resolveSibling("summary.txt");
    String text =
        "bytes=" + data.capacity() + " meshes=" + meshes + " materials=" + materials
            + " images=" + images + " nodes=" + nodes + "\n"
            + root.getAsJsonArray("materials") + "\n" + root.getAsJsonArray("meshes") + "\n";
    Files.writeString(summary, text);
    System.out.println("MINEMORIES-GLB " + text.lines().findFirst().orElse(""));
    if (meshes == 0 || materials == 0 || images == 0)
      throw new AssertionError("Empty GLB: " + text.lines().findFirst().orElse(""));
    // Standard blocks, alpha (glass blends, leaves cut out), tint, a block entity, entities, fluid.
    for (String expected :
        new String[] {
          "minemories:cut / minecraft:block/dirt", "red_stained_glass", "oak_leaves", GRASS,
          "grass_block_top", "minecraft:chest", "minecraft:cow", "minecraft:armor_stand",
          // The gateway shares the portal's baked material, named after whichever was captured first.
          "minecraft:water", "minecraft:torch", "minecraft:end_portal / rendered/minemories"
        })
      if (!text.contains(expected)) throw new AssertionError("Missing from GLB: " + expected);
    if (!text.contains("\"alphaMode\":\"BLEND\"") || !text.contains("\"alphaMode\":\"MASK\""))
      throw new AssertionError("Modes alpha BLEND et MASK attendus");
    if (!sealedFromInside(root, data, 20 + jsonLength + 8))
      throw new AssertionError("The air pocket on the +x edge is not sealed from inside");
  }

  /**
   * Materials are single-sided, so the seal of an empty cell on the cut (the air pocket of the
   * scene) needs a face pointing back into the capture: a cut face on the outer +x plane whose
   * normal points to -x.
   */
  private static boolean sealedFromInside(JsonObject root, ByteBuffer data, int binary) {
    var materials = root.getAsJsonArray("materials");
    var nodes = root.getAsJsonArray("nodes");
    float outer = -Float.MAX_VALUE;
    java.util.List<float[]> inward = new java.util.ArrayList<>();
    for (var element : nodes) {
      JsonObject node = element.getAsJsonObject();
      if (!node.has("mesh")) continue;
      float scale = node.has("scale") ? node.getAsJsonArray("scale").get(0).getAsFloat() : 1;
      float offset =
          node.has("translation") ? node.getAsJsonArray("translation").get(0).getAsFloat() : 0;
      int meshIndex = node.get("mesh").getAsInt();
      JsonObject mesh = root.getAsJsonArray("meshes").get(meshIndex).getAsJsonObject();
      for (var primitiveElement : mesh.getAsJsonArray("primitives")) {
        JsonObject primitive = primitiveElement.getAsJsonObject();
        int material = primitive.get("material").getAsInt();
        String name = materials.get(material).getAsJsonObject().get("name").getAsString();
        if (!name.startsWith("minemories:cut")) continue;
        JsonObject attributes = primitive.getAsJsonObject("attributes");
        float[] x = component(root, data, binary, attributes.get("POSITION").getAsInt(), 0);
        float[] nx = component(root, data, binary, attributes.get("NORMAL").getAsInt(), 0);
        for (int i = 0; i < x.length; i++) {
          float world = x[i] * scale + offset;
          outer = Math.max(outer, world);
          if (nx[i] < -0.5f) inward.add(new float[] {world});
        }
      }
    }
    for (float[] vertex : inward) if (Math.abs(vertex[0] - outer) < 1e-3f) return true;
    return false;
  }

  /** One component of a float, short or byte accessor (normalized when flagged), per element. */
  private static float[] component(
      JsonObject root, ByteBuffer data, int binary, int accessorIndex, int component) {
    JsonObject accessor = root.getAsJsonArray("accessors").get(accessorIndex).getAsJsonObject();
    int viewIndex = accessor.get("bufferView").getAsInt();
    JsonObject view = root.getAsJsonArray("bufferViews").get(viewIndex).getAsJsonObject();
    int type = accessor.get("componentType").getAsInt();
    int size = type == 5126 ? 4 : type == 5122 || type == 5123 ? 2 : 1;
    int stride = view.has("byteStride") ? view.get("byteStride").getAsInt() : size * 3;
    int base =
        binary
            + (view.has("byteOffset") ? view.get("byteOffset").getAsInt() : 0)
            + (accessor.has("byteOffset") ? accessor.get("byteOffset").getAsInt() : 0);
    boolean normalized = accessor.has("normalized") && accessor.get("normalized").getAsBoolean();
    float[] values = new float[accessor.get("count").getAsInt()];
    for (int i = 0; i < values.length; i++) {
      int at = base + i * stride + component * size;
      values[i] =
          switch (type) {
            case 5126 -> data.getFloat(at);
            case 5122 ->
                normalized ? Math.max(-1f, data.getShort(at) / 32767f) : data.getShort(at);
            case 5120 -> normalized ? Math.max(-1f, data.get(at) / 127f) : data.get(at);
            default -> throw new AssertionError("Unexpected accessor component type " + type);
          };
    }
    return values;
  }
}
