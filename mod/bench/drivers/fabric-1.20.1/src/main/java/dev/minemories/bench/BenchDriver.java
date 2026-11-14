package dev.minemories.bench;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandManager;
import net.fabricmc.fabric.api.client.command.v2.FabricClientCommandSource;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.AccessibilityOnboardingScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.GameRules;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPresets;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Render bench driver (test only, never shipped): with -Dminemories.bench=<dir>/plan.json it creates a fresh flat
 * creative world, lays every block of the plan's namespaces out on a grid, assembles Create bearings when asked,
 * records which blocks stayed in place, runs /minemories export around the grid and quits. Its outputs go next to
 * the plan: placed.json (what each cell holds), done.json (the export it made). The `bun mod bench` tool reads them.
 */
public final class BenchDriver implements ClientModInitializer {
  private static final Logger LOG = LoggerFactory.getLogger("minemories-bench");
  private static final int FLOOR = -60;
  private static final int PER_TICK = 200;

  private enum Step { MENU, LOADING, PLACING, SETTLING, ACTING, READING, EXPORTING, DONE }

  private Path plan;
  private JsonObject config;
  private Step step = Step.MENU;
  private int ticks;
  private final List<Cell> cells = new ArrayList<>();
  private int placed;
  private int radius;
  /** Blocks apart on the grid: 4 keeps a 3x3 block (a large water wheel) out of its neighbours' cells. */
  private int spacing = 4;
  private long exportStarted;

  private record Cell(BlockPos pos, ResourceLocation id) {}

  @Override
  public void onInitializeClient() {
    String path = System.getProperty("minemories.bench");
    if (path == null) return;
    plan = Path.of(path).toAbsolutePath();
    ClientTickEvents.END_CLIENT_TICK.register(this::tick);
  }

  private void tick(Minecraft mc) {
    ticks++;
    try {
      switch (step) {
        case MENU -> menu(mc);
        case LOADING -> loading(mc);
        case PLACING -> placing(mc);
        case SETTLING -> {
          if (ticks > 100) next(Step.ACTING);
        }
        case ACTING -> acting(mc);
        case READING -> reading(mc);
        case EXPORTING -> exporting(mc);
        case DONE -> {}
      }
    } catch (Throwable failure) {
      LOG.error("MINEMORIES-BENCH FAILED", failure);
      write("done.json", "{\"error\":" + quote(failure.toString()) + "}");
      Runtime.getRuntime().halt(1);
    }
  }

  private void menu(Minecraft mc) throws Exception {
    mc.options.getSoundSourceOptionInstance(SoundSource.MASTER).set(0.0);
    mc.options.pauseOnLostFocus = false;
    if (mc.screen instanceof AccessibilityOnboardingScreen) {
      mc.options.onboardAccessibility = false;
      mc.setScreen(new TitleScreen());
    }
    if (!(mc.screen instanceof TitleScreen) || ticks < 40) return;
    config = JsonParser.parseString(Files.readString(plan, StandardCharsets.UTF_8)).getAsJsonObject();
    String world = "MinemoriesBench";
    Path saves = mc.gameDirectory.toPath().resolve("saves").resolve(world);
    if (Files.exists(saves))
      try (var paths = Files.walk(saves)) {
        for (Path p : (Iterable<Path>) paths.sorted(java.util.Comparator.reverseOrder())::iterator) Files.delete(p);
      }
    GameRules rules = new GameRules();
    rules.getRule(GameRules.RULE_RANDOMTICKING).set(0, null);
    rules.getRule(GameRules.RULE_DAYLIGHT).set(false, null);
    rules.getRule(GameRules.RULE_DOMOBSPAWNING).set(false, null);
    rules.getRule(GameRules.RULE_WEATHER_CYCLE).set(false, null);
    mc.createWorldOpenFlows()
        .createFreshLevel(
            world,
            new LevelSettings(world, GameType.CREATIVE, false, Difficulty.PEACEFUL, true, rules, WorldDataConfiguration.DEFAULT),
            new WorldOptions(1L, false, false),
            access -> access.registryOrThrow(Registries.WORLD_PRESET).getOrThrow(WorldPresets.FLAT).createWorldDimensions());
    next(Step.LOADING);
  }

  private void loading(Minecraft mc) {
    if (mc.level == null || mc.player == null || mc.screen != null || ticks < 100) return;
    Set<String> namespaces = new TreeSet<>();
    for (var element : config.getAsJsonArray("namespaces")) namespaces.add(element.getAsString());
    // Blocks that cannot be set without the item that normally places them (they crash the world tick).
    Set<String> excluded = new TreeSet<>();
    // A list, or an object whose keys are the blocks (the values say why).
    if (config.has("exclude")) {
      var exclude = config.get("exclude");
      if (exclude.isJsonArray()) for (var element : exclude.getAsJsonArray()) excluded.add(element.getAsString());
      else excluded.addAll(exclude.getAsJsonObject().keySet());
    }
    if (config.has("spacing")) spacing = Math.max(2, config.get("spacing").getAsInt());
    List<ResourceLocation> ids = new ArrayList<>();
    for (ResourceLocation id : BuiltInRegistries.BLOCK.keySet()) {
      if (!namespaces.contains(id.getNamespace()) || excluded.contains(id.toString())) continue;
      Block block = BuiltInRegistries.BLOCK.get(id);
      BlockState state = block.defaultBlockState();
      if (state.isAir() || state.getRenderShape() == RenderShape.INVISIBLE) continue;
      ids.add(id);
    }
    ids.sort(java.util.Comparator.comparing(ResourceLocation::toString));
    int columns = Math.max(1, (int) Math.ceil(Math.sqrt(ids.size())));
    for (int i = 0; i < ids.size(); i++) {
      int col = i % columns, row = i / columns;
      cells.add(new Cell(new BlockPos(4 + col * spacing, FLOOR, 4 + row * spacing), ids.get(i)));
    }
    int extent = 4 + columns * spacing;
    radius = Math.max(8, Math.min(128, extent / 2 + 4));
    LOG.info("MINEMORIES-BENCH {} blocks from {} on a {}x{} grid, radius {}", ids.size(), namespaces, columns, columns, radius);
    MinecraftServer server = mc.getSingleplayerServer();
    int centre = extent / 2;
    server.execute(() -> server.getPlayerList().getPlayers().get(0).teleportTo(centre + 0.5, FLOOR + 1, centre + 0.5));
    next(Step.PLACING);
  }

  private void placing(Minecraft mc) {
    MinecraftServer server = mc.getSingleplayerServer();
    int from = placed, to = Math.min(cells.size(), placed + PER_TICK);
    server.execute(() -> {
      var level = server.overworld();
      for (int i = from; i < to; i++) {
        Cell cell = cells.get(i);
        // No neighbour updates: a block that needs support stays as placed when it can.
        level.setBlock(cell.pos(), BuiltInRegistries.BLOCK.get(cell.id()).defaultBlockState(), 2 | 16);
      }
    });
    placed = to;
    if (placed >= cells.size()) next(Step.SETTLING);
  }

  /** Create bearings carrying a block: a creative motor, a bearing and wool, then the bearing is asked to assemble. */
  private void acting(Minecraft mc) {
    MinecraftServer server = mc.getSingleplayerServer();
    if (ticks == 1 && config.has("contraption") && config.get("contraption").getAsBoolean()) {
      server.execute(() -> {
        var level = server.overworld();
        BlockPos base = new BlockPos(1, FLOOR - 1, 1);
        var motor = BuiltInRegistries.BLOCK.get(new ResourceLocation("create", "creative_motor"));
        var bearing = BuiltInRegistries.BLOCK.get(new ResourceLocation("create", "mechanical_bearing"));
        var facing = net.minecraft.world.level.block.state.properties.BlockStateProperties.FACING;
        level.setBlock(base, motor.defaultBlockState().setValue(facing, net.minecraft.core.Direction.UP), 3);
        level.setBlock(base.above(), bearing.defaultBlockState().setValue(facing, net.minecraft.core.Direction.UP), 3);
        level.setBlock(base.above(2), Blocks.WHITE_WOOL.defaultBlockState(), 3);
      });
    }
    if (ticks == 40 && config.has("contraption") && config.get("contraption").getAsBoolean()) {
      server.execute(() -> {
        var entity = server.overworld().getBlockEntity(new BlockPos(1, FLOOR, 1));
        for (Class<?> type = entity == null ? null : entity.getClass(); type != null; type = type.getSuperclass()) {
          try {
            Field field = type.getDeclaredField("assembleNextTick");
            field.setAccessible(true);
            field.setBoolean(entity, true);
            return;
          } catch (ReflectiveOperationException next) {
            // Declared higher up.
          }
        }
        LOG.warn("MINEMORIES-BENCH no bearing to assemble");
      });
    }
    if (ticks > 120) next(Step.READING);
  }

  private void reading(Minecraft mc) {
    JsonArray out = new JsonArray();
    for (Cell cell : cells) {
      JsonObject row = new JsonObject();
      row.addProperty("id", cell.id().toString());
      row.addProperty("x", cell.pos().getX());
      row.addProperty("y", cell.pos().getY());
      row.addProperty("z", cell.pos().getZ());
      row.addProperty("actual", BuiltInRegistries.BLOCK.getKey(mc.level.getBlockState(cell.pos()).getBlock()).toString());
      out.add(row);
    }
    JsonObject result = new JsonObject();
    result.add("cells", out);
    long contraptions = 0;
    for (var entity : mc.level.entitiesForRendering())
      if (entity.getClass().getName().contains("Contraption")) contraptions++;
    result.addProperty("contraptions", contraptions);
    if (config.has("contraption") && config.get("contraption").getAsBoolean()) {
      JsonObject contraption = new JsonObject();
      contraption.addProperty("x", 1);
      contraption.addProperty("y", FLOOR + 1);
      contraption.addProperty("z", 1);
      contraption.addProperty("id", "minecraft:white_wool");
      result.add("contraption", contraption);
    }
    result.addProperty("radius", radius);
    result.addProperty("spacing", spacing);
    // Flywheel and shaders behave differently on software rendering: every result says which renderer drew it.
    result.addProperty("renderer", com.mojang.blaze3d.platform.GlUtil.getRenderer());
    result.addProperty("minecraft", net.minecraft.SharedConstants.getCurrentVersion().getName());
    JsonObject mods = new JsonObject();
    for (var mod : net.fabricmc.loader.api.FabricLoader.getInstance().getAllMods())
      mods.addProperty(mod.getMetadata().getId(), mod.getMetadata().getVersion().getFriendlyString());
    result.add("mods", mods);
    write("placed.json", result.toString());
    exportStarted = System.currentTimeMillis();
    var source = (FabricClientCommandSource) mc.getConnection().getSuggestionsProvider();
    try {
      ClientCommandManager.getActiveDispatcher().execute("minemories export " + radius, source);
    } catch (Exception error) {
      throw new IllegalStateException("export command failed", error);
    }
    next(Step.EXPORTING);
  }

  private void exporting(Minecraft mc) throws Exception {
    Path glb = Path.of(System.getProperty("user.home"), "export", "capture.glb");
    if (Files.exists(glb) && Files.getLastModifiedTime(glb).toMillis() >= exportStarted && ticks > 60) {
      write("done.json", "{\"glb\":" + quote(glb.toString()) + ",\"json\":" + quote(glb.resolveSibling("capture.json").toString()) + "}");
      LOG.info("MINEMORIES-BENCH DONE");
      next(Step.DONE);
      mc.stop();
    } else if (ticks > 20 * 600) throw new IllegalStateException("export timed out");
  }

  private void next(Step step) {
    this.step = step;
    ticks = 0;
    LOG.info("MINEMORIES-BENCH step {}", step);
  }

  private void write(String name, String text) {
    try {
      Files.writeString(plan.resolveSibling(name), text, StandardCharsets.UTF_8);
    } catch (Exception error) {
      LOG.error("MINEMORIES-BENCH could not write {}", name, error);
    }
  }

  private static String quote(String text) {
    return new com.google.gson.JsonPrimitive(text).toString();
  }
}
