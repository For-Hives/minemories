package dev.minemories.gametest;

import java.io.IOException;
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
    // A window without focus pauses the game and its integrated server: the world never finishes loading (and a
    // headless machine never has focus).
    context.runOnClient(
        client -> {
          client.options.pauseOnLostFocus = false;
          client.options.enableVsync().set(false);
        });
    Path glb = GlbReport.exportedGlb();
    try (TestSingleplayerContext world = context.worldBuilder().create()) {
      world.getConnection().waitForChunksRender();
      var server = world.getServer();
      for (String command : GlbReport.SCENE) server.runCommand(command);
      context.waitTicks(40);
      context.takeScreenshot("before-capture");
      context.runOnClient(
          client -> client.player.connection.sendCommand(GlbReport.EXPORT_COMMAND));
      context.waitFor(client -> Files.exists(glb), 20 * 60);
      context.waitTicks(20);
      context.takeScreenshot("after-capture");
      // Pairing, upload, diagnostics and selection, against a mock API (see FeatureScenario).
      var gameDir = new java.util.concurrent.atomic.AtomicReference<Path>();
      context.runOnClient(client -> gameDir.set(Path.of(client.gameDirectory.getAbsolutePath())));
      FeatureScenario features = new FeatureScenario(gameDir.get());
      var host =
          new FeatureScenario.Host() {
            @Override
            public void client(String command) {
              context.runOnClient(client -> client.player.connection.sendCommand(command));
            }

            @Override
            public void server(String command) {
              world.getServer().runCommand(command);
            }
          };
      try {
        while (!features.tick(host)) context.waitTicks(1);
      } finally {
        features.close();
      }
    } catch (IOException error) {
      throw new AssertionError("Test setup failed: " + error, error);
    }
    try {
      GlbReport.report(glb);
    } catch (IOException error) {
      throw new AssertionError("GLB illisible : " + error, error);
    }
  }

}
