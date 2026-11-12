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
import net.minecraft.world.level.dimension.DimensionType;
import net.minecraft.world.level.levelgen.WorldGenSettings;
import net.minecraft.world.level.levelgen.flat.FlatLevelGeneratorSettings;
import net.minecraft.world.level.levelgen.FlatLevelSource;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Minecraft 1.18.2 version of the loader test driver (see mod/1.21.11/gametest-common):
 * creates a flat world, builds the scene, runs /minemories export, checks the GLB and exits.
 * The loader's test mod calls {@link #tick()} from its client tick.
 */
public final class TickDrivenCapture {
  private static final Logger LOGGER = LogManager.getLogger("minemories-gametest");

  private TickDrivenCapture() {}

  private enum Step { MENU, LOADING, SETTLING, EXPORTING, FEATURES, DONE }

  private static Step step = Step.MENU;
  private static int ticks;
  private static FeatureScenario features;

  public static void tick() {
    Minecraft mc = Minecraft.getInstance();
    ticks++;
    try {
      switch (step) {
        case MENU -> {
          mc.options.setSoundCategoryVolume(SoundSource.MASTER, 0f);
          // A window without focus pauses the game and its integrated server: the world never finishes loading (and
          // a headless machine never has focus).
          mc.options.pauseOnLostFocus = false;
          mc.options.enableVsync = false;
          mc.getWindow().updateVsync(false);
          if (mc.screen instanceof TitleScreen && ticks > 40) {
            RegistryAccess access = RegistryAccess.builtinCopy();
            var biomes = access.registryOrThrow(Registry.BIOME_REGISTRY);
            var structures = access.registryOrThrow(Registry.STRUCTURE_SET_REGISTRY);
            var generator =
                new FlatLevelSource(structures, FlatLevelGeneratorSettings.getDefault(biomes, structures));
            var dimensions =
                WorldGenSettings.withOverworld(
                    access.registryOrThrow(Registry.DIMENSION_TYPE_REGISTRY),
                    DimensionType.defaultDimensions(access, 1L),
                    generator);
            GlbReport.freshWorld("MinemoriesTest");
            mc.createLevel(
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
                new WorldGenSettings(1L, false, false, dimensions));
            step(Step.LOADING);
          }
        }
        case LOADING -> {
          if (mc.level != null && mc.player != null && mc.screen == null && ticks > 200) {
            MinecraftServer server = mc.getSingleplayerServer();
            server.execute(
                () -> {
                  for (String command : GlbReport.SCENE)
                    server.getCommands().performCommand(server.createCommandSourceStack(), command);
                });
            step(Step.SETTLING);
          }
        }
        case SETTLING -> {
          if (ticks > 100) {
            // /minemories is a client command: it goes through the chat screen like typed input.
            ChatScreen chat = new ChatScreen("");
            mc.setScreen(chat);
            chat.sendMessage("/" + GlbReport.EXPORT_COMMAND, false);
            mc.setScreen(null);
            step(Step.EXPORTING);
          }
        }
        case EXPORTING -> {
          if (Files.exists(GlbReport.exportedGlb()) && ticks > 60) {
            GlbReport.report(GlbReport.exportedGlb());
            features = new FeatureScenario(mc.gameDirectory.toPath());
            step(Step.FEATURES);
          } else if (ticks > 20 * 90) throw new AssertionError("Export timed out");
        }
        case FEATURES -> {
          if (features.tick(host(mc))) {
            features.close();
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


  private static FeatureScenario.Host host(Minecraft mc) {
    return new FeatureScenario.Host() {
      @Override
      public void client(String command) {
        // /minemories is a client command: it goes through the chat screen like typed input.
        ChatScreen chat = new ChatScreen("");
        mc.setScreen(chat);
        chat.sendMessage("/" + command, false);
        mc.setScreen(null);
      }

      @Override
      public void server(String command) {
        MinecraftServer server = mc.getSingleplayerServer();
        server.execute(
            () -> server.getCommands().performCommand(server.createCommandSourceStack(), command));
      }
    };
  }

  private static void step(Step next) {
    step = next;
    ticks = 0;
    LOGGER.info("MINEMORIES-GAMETEST step {}", next);
  }
}
