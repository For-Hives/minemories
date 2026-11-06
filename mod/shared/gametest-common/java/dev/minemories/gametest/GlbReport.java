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
    "setblock 4 -60 0 minecraft:oak_leaves",
    "setblock 5 -60 0 minecraft:grass_block",
    "setblock 5 -59 0 minecraft:" + GRASS,
    "setblock 6 -60 0 minecraft:chest",
    "setblock 7 -60 0 minecraft:water",
    "setblock -3 -60 0 minecraft:torch",
    "summon minecraft:cow 3 -60 3 {NoAI:1b}",
    "summon minecraft:armor_stand 5 -60 3"
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
      throw new AssertionError("GLB vide : " + text.lines().findFirst().orElse(""));
    // Standard blocks, alpha (glass blends, leaves cut out), tint, a block entity, entities, fluid.
    for (String expected :
        new String[] {
          "minemories:cut / minecraft:block/stone", "red_stained_glass", "oak_leaves", GRASS,
          "grass_block_top", "minecraft:chest", "minecraft:cow", "minecraft:armor_stand",
          "minecraft:water", "minecraft:torch"
        })
      if (!text.contains(expected)) throw new AssertionError("Absent du GLB : " + expected);
    if (!text.contains("\"alphaMode\":\"BLEND\"") || !text.contains("\"alphaMode\":\"MASK\""))
      throw new AssertionError("Modes alpha BLEND et MASK attendus");
  }
}
