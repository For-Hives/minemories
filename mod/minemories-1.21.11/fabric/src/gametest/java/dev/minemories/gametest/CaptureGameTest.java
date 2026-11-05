package dev.minemories.gametest;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Captures a small world (standard blocks, alpha and tinted textures, a chest, a cow, an armor
 * stand) through the real /minemories export command and checks what ended up in the GLB.
 */
public final class CaptureGameTest implements FabricClientGameTest {
  @Override
  public void runTest(ClientGameTestContext context) {
    // Tests never play sound.
    context.runOnClient(
        client ->
            client
                .options
                .getSoundSourceOptionInstance(net.minecraft.sounds.SoundSource.MASTER)
                .set(0.0));
    Path glb = Path.of(System.getProperty("user.home"), "export", "capture.glb");
    try (TestSingleplayerContext world = context.worldBuilder().create()) {
      world.getClientWorld().waitForChunksRender();
      var server = world.getServer();
      server.runCommand("tp @p 0 -60 0");
      server.runCommand("setblock 2 -61 0 minecraft:stone");
      server.runCommand("setblock 2 -60 0 minecraft:stone");
      server.runCommand("setblock 3 -60 0 minecraft:red_stained_glass");
      server.runCommand("setblock 4 -60 0 minecraft:oak_leaves");
      server.runCommand("setblock 5 -60 0 minecraft:grass_block");
      server.runCommand("setblock 5 -59 0 minecraft:short_grass");
      server.runCommand("setblock 6 -60 0 minecraft:chest");
      server.runCommand("setblock 7 -60 0 minecraft:water");
      server.runCommand("setblock -3 -60 0 minecraft:torch");
      server.runCommand("summon minecraft:cow 3 -60 3 {NoAI:1b}");
      server.runCommand("summon minecraft:armor_stand 5 -60 3");
      context.waitTicks(40);
      context.takeScreenshot("before-capture");
      context.runOnClient(
          client -> client.player.connection.sendCommand("minemories export 12"));
      context.waitFor(client -> Files.exists(glb), 20 * 60);
      context.waitTicks(20);
      context.takeScreenshot("after-capture");
    } catch (RuntimeException error) {
      throw error;
    }
    try {
      report(glb);
    } catch (IOException error) {
      throw new AssertionError("GLB illisible : " + error, error);
    }
  }

  private static void report(Path glb) throws IOException {
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
          "minemories:cut / minecraft:block/stone", "red_stained_glass", "oak_leaves", "short_grass",
          "grass_block_top", "minecraft:chest", "minecraft:cow", "minecraft:armor_stand",
          "minecraft:water", "minecraft:torch"
        })
      if (!text.contains(expected)) throw new AssertionError("Absent du GLB : " + expected);
    if (!text.contains("\"alphaMode\":\"BLEND\"") || !text.contains("\"alphaMode\":\"MASK\""))
      throw new AssertionError("Modes alpha BLEND et MASK attendus");
  }
}
