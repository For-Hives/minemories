package dev.minemories.gametest;

import java.nio.file.Files;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.core.Registry;
import net.minecraft.core.RegistryAccess;
import net.minecraft.server.MinecraftServer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.DataPackConfig;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Minecraft 1.19.2 version of the loader test driver (see mod/minemories-1.21.11/gametest-common):
 * creates a flat world, builds the scene, runs /minemories export, checks the GLB and exits.
 * The loader's test mod calls {@link #tick()} from its client tick.
 */
public final class TickDrivenCapture {
  private static final Logger LOGGER = LogManager.getLogger("minemories-gametest");

  private TickDrivenCapture() {}

  private enum Step { MENU, LOADING, SETTLING, EXPORTING, DONE }

  private static Step step = Step.MENU;
  private static int ticks;

  public static void tick() {
    Minecraft mc = Minecraft.getInstance();
    ticks++;
    try {
      switch (step) {
        case MENU -> {
          mc.options.setSoundCategoryVolume(SoundSource.MASTER, 0f);
          if (mc.screen instanceof TitleScreen && ticks > 40) {
            RegistryAccess.Writable access = RegistryAccess.builtinCopy();
            var settings =
                access
                    .registryOrThrow(Registry.WORLD_PRESET_REGISTRY)
                    .getOrThrow(WorldPresets.FLAT)
                    .createWorldGenSettings(1L, false, false);
            mc.createWorldOpenFlows()
                .createFreshLevel(
                    "MinemoriesTest",
                    new LevelSettings(
                        "MinemoriesTest",
                        GameType.CREATIVE,
                        false,
                        Difficulty.PEACEFUL,
                        true,
                        new GameRules(),
                        DataPackConfig.DEFAULT),
                    access,
                    settings);
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
  }
}
