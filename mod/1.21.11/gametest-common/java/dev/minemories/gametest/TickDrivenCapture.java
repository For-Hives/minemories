package dev.minemories.gametest;

import java.nio.file.Files;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.AccessibilityOnboardingScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.worldselection.CreateWorldScreen;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * For loaders without a client game test API: a state machine a loader's test mod calls from its
 * client tick. It creates a flat world, builds the scene, runs /minemories export, checks the GLB
 * and exits.
 */
public final class TickDrivenCapture {
  private static final Logger LOGGER = LoggerFactory.getLogger("minemories-gametest");
  private TickDrivenCapture() {}

  private enum Step { MENU, CREATING, LOADING, SETTLING, EXPORTING, DONE }

  private static Step step = Step.MENU;
  private static int ticks;

  public static void tick() {
    Minecraft mc = Minecraft.getInstance();
    ticks++;
    try {
      switch (step) {
        case MENU -> {
          mc.options.getSoundSourceOptionInstance(SoundSource.MASTER).set(0.0);
          // A fresh profile opens the accessibility onboarding before the title screen.
          if (mc.screen instanceof AccessibilityOnboardingScreen) {
            mc.options.onboardAccessibility = false;
            mc.setScreen(new TitleScreen());
          }
          if (mc.screen instanceof TitleScreen && ticks > 40) {
            CreateWorldScreen.openFresh(mc, () -> {});
            step(Step.CREATING);
          }
        }
        case CREATING -> {
          if (mc.screen instanceof CreateWorldScreen screen && ticks > 40) {
            var state = screen.getUiState();
            var flat =
                state.getNormalPresetList().stream()
                    .filter(entry -> entry.preset().is(WorldPresets.FLAT))
                    .findFirst()
                    .orElseThrow();
            state.setWorldType(flat);
            state.setSeed("1");
            state.setGenerateStructures(false);
            var onCreate = CreateWorldScreen.class.getDeclaredMethod("onCreate");
            onCreate.setAccessible(true);
            onCreate.invoke(screen);
            step(Step.LOADING);
          }
        }
        case LOADING -> {
          if (mc.level != null && mc.player != null && mc.screen == null && ticks > 200) {
            var server = mc.getSingleplayerServer();
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
            mc.player.connection.sendCommand(GlbReport.EXPORT_COMMAND);
            step(Step.EXPORTING);
          }
        }
        case EXPORTING -> {
          if (Files.exists(GlbReport.exportedGlb()) && ticks > 60) {
            GlbReport.report(GlbReport.exportedGlb());
            LOGGER.info("MINEMORIES-GAMETEST PASSED");
            step(Step.DONE);
            mc.stop();
          } else if (ticks > 20 * 90) throw new AssertionError("Export timed out");
        }
        case DONE -> {}
      }
    } catch (Throwable failure) {
      LOGGER.error("MINEMORIES-GAMETEST FAILED", failure);
      Runtime.getRuntime().halt(1);
    }
  }

  private static void step(Step next) {
    step = next;
    ticks = 0;
    LOGGER.info("MINEMORIES-GAMETEST step {}", next);
  }
}
