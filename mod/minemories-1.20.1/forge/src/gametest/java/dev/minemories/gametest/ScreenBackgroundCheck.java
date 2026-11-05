package dev.minemories.gametest;

import com.mojang.blaze3d.platform.NativeImage;
import java.lang.reflect.Field;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.AccessibilityOnboardingScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.core.registries.Registries;
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
 * Opens the Minemories hub in a flat world and reads a pixel inside its panel from the frame
 * buffer: the panel colour proves the screen's background was drawn. Driven from the client tick
 * by the loader's test mod.
 */
public final class ScreenBackgroundCheck {
  private static final Logger LOGGER = LogManager.getLogger("minemories-gametest");
  // UiTheme.PANEL (0xFF252926) as NativeImage stores it: ABGR.
  private static final int PANEL_ABGR = 0xFF262925;

  private ScreenBackgroundCheck() {}

  private enum Step { MENU, LOADING, SCREEN, DONE }

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
            Class<?> hub = Class.forName("dev.minemories.client.SimpleHubScreen");
            var constructor = hub.getDeclaredConstructor(Screen.class);
            constructor.setAccessible(true);
            mc.setScreen((Screen) constructor.newInstance((Object) null));
            step(Step.SCREEN);
          }
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
              if (pixel != PANEL_ABGR) throw new AssertionError("Fond de l'écran non dessiné");
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
