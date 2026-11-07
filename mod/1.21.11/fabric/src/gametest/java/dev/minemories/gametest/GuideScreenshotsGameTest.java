package dev.minemories.gametest;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.gui.screens.ChatScreen;
import org.lwjgl.glfw.GLFW;

/**
 * Takes the in-game screenshots of the installation guide (/installation on the website): the
 * pause menu with its Minemories button, the menu opened with M, and the export command typed in
 * chat. Copy them from run/screenshots into apps/web/src/assets/tutorial/game whenever the button,
 * the menu or the command changes (procedure in that folder's README).
 */
public final class GuideScreenshotsGameTest implements FabricClientGameTest {
  @Override
  public void runTest(ClientGameTestContext context) {
    context.runOnClient(
        client -> {
          client
              .options
              .getSoundSourceOptionInstance(net.minecraft.sounds.SoundSource.MASTER)
              .set(0.0);
          client.options.pauseOnLostFocus = false;
          client.options.enableVsync().set(false);
          // A readable interface on a 1280x720 image, like a default window on a laptop.
          client.options.guiScale().set(2);
        });
    context.getInput().resizeWindow(1280, 720);
    try (TestSingleplayerContext world = context.worldBuilder().create()) {
      world.getClientWorld().waitForChunksRender();
      context.waitTicks(20);
      // Escape opens the pause menu: the Minemories button sits in its top-right corner (another
      // corner when a mod already uses that one).
      context.getInput().pressKey(GLFW.GLFW_KEY_ESCAPE);
      context.waitTicks(10);
      context.takeScreenshot("guide-pause-menu");
      context.setScreen(() -> null);
      context.waitTicks(10);
      // M opens the Minemories menu itself.
      context.getInput().pressKey(GLFW.GLFW_KEY_M);
      context.waitTicks(10);
      context.takeScreenshot("guide-minemories-menu");
      context.setScreen(() -> null);
      context.waitTicks(10);
      // The command alternative, typed in chat (T) but not sent.
      context.setScreen(() -> new ChatScreen("/minemories export 16", false));
      context.waitTicks(10);
      context.takeScreenshot("guide-export-command");
      context.setScreen(() -> null);
    }
  }
}
