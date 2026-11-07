package dev.minemories.gametest;

import com.mojang.blaze3d.platform.NativeImage;
import java.lang.reflect.Field;
import java.nio.file.Files;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.AccessibilityOnboardingScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.core.registries.Registries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Minecraft 1.20.1 version of the loader test driver (see mod/1.21.11/gametest-common):
 * creates a flat world, builds the scene, runs /minemories export and checks the GLB, then opens
 * the Minemories hub and reads a pixel inside its panel from the frame buffer: the panel colour
 * proves the screen's background was drawn. The loader's test mod calls {@link #tick()} from its
 * client tick.
 */
public final class TickDrivenCapture {
  private static final Logger LOGGER = LogManager.getLogger("minemories-gametest");
  // UiTheme.PANEL (0xFF252926) as NativeImage stores it: ABGR.
  private static final int PANEL_ABGR = 0xFF262925;

  private TickDrivenCapture() {}

  private enum Step { MENU, LOADING, SETTLING, EXPORTING, SCREEN, DONE }

  private static Step step = Step.MENU;
  private static int ticks;

  public static void tick() {
    Minecraft mc = Minecraft.getInstance();
    ticks++;
    try {
      switch (step) {
        case MENU -> {
          mc.options.getSoundSourceOptionInstance(SoundSource.MASTER).set(0.0);
          // A window without focus pauses the game and its integrated server: the world never finishes loading (and
          // a headless machine never has focus).
          mc.options.pauseOnLostFocus = false;
          mc.options.enableVsync().set(false);
          // A fresh profile opens the accessibility onboarding before the title screen.
          if (mc.screen instanceof AccessibilityOnboardingScreen) {
            mc.options.onboardAccessibility = false;
            mc.setScreen(new TitleScreen());
          }
          if (mc.screen instanceof TitleScreen && ticks > 40) {
            mc.createWorldOpenFlows()
                .createFreshLevel(
                    "MinemoriesScreen",
                    new LevelSettings(
                        "MinemoriesScreen",
                        GameType.CREATIVE,
                        false,
                        Difficulty.PEACEFUL,
                        true,
                        new GameRules(),
                        WorldDataConfiguration.DEFAULT),
                    new WorldOptions(1L, false, false),
                    access ->
                        access
                            .registryOrThrow(Registries.WORLD_PRESET)
                            .getOrThrow(WorldPresets.FLAT)
                            .createWorldDimensions());
            step(Step.LOADING);
          }
        }
        case LOADING -> {
          if (mc.level != null && mc.player != null && mc.screen == null && ticks > 200) {
            MinecraftServer server = mc.getSingleplayerServer();
            server.execute(
                () -> {
                  for (String command : GlbReport.SCENE)
                    server.getCommands().performPrefixedCommand(server.createCommandSourceStack(), command);
                });
            step(Step.SETTLING);
          }
        }
        case SETTLING -> {
          if (ticks > 100) {
            // /minemories is a client command: it goes through the chat screen like typed input.
            ChatScreen chat = new ChatScreen("");
            mc.setScreen(chat);
            chat.handleChatInput("/" + GlbReport.EXPORT_COMMAND, false);
            mc.setScreen(null);
            step(Step.EXPORTING);
          }
        }
        case EXPORTING -> {
          if (Files.exists(GlbReport.exportedGlb()) && ticks > 60) {
            GlbReport.report(GlbReport.exportedGlb());
            Class<?> hub = Class.forName("dev.minemories.client.SimpleHubScreen");
            var constructor = hub.getDeclaredConstructor(Screen.class);
            constructor.setAccessible(true);
            mc.setScreen((Screen) constructor.newInstance((Object) null));
            step(Step.SCREEN);
          } else if (ticks > 20 * 90) throw new AssertionError("Export timed out");
        }
        case SCREEN -> {
          if (ticks > 40) {
            Screen screen = mc.screen;
            int left = field(screen, "left");
            int top = field(screen, "top");
            int panelHeight = field(screen, "panelHeight");
            double scale = mc.getWindow().getGuiScale();
            try (NativeImage image = Screenshot.takeScreenshot(mc.getMainRenderTarget())) {
              int x = (int) ((left + 3) * scale);
              int y = (int) ((top + panelHeight / 2) * scale);
              int pixel = image.getPixelRGBA(x, y);
              LOGGER.info(
                  "MINEMORIES-SCREEN pixel=0x{} expected=0x{} at {},{}",
                  Integer.toHexString(pixel),
                  Integer.toHexString(PANEL_ABGR),
                  x,
                  y);
              if (pixel != PANEL_ABGR) throw new AssertionError("Screen background not drawn");
            }
            LOGGER.info("MINEMORIES-GAMETEST PASSED");
            step(Step.DONE);
            mc.stop();
          }
        }
        case DONE -> {}
      }
    } catch (Throwable failure) {
      LOGGER.error("MINEMORIES-GAMETEST FAILED", failure);
      Runtime.getRuntime().halt(1);
    }
  }

  private static int field(Object target, String name) throws ReflectiveOperationException {
    Field field = target.getClass().getDeclaredField(name);
    field.setAccessible(true);
    return field.getInt(target);
  }

  private static void step(Step next) {
    step = next;
    ticks = 0;
    LOGGER.info("MINEMORIES-GAMETEST step {}", next);
  }
}
