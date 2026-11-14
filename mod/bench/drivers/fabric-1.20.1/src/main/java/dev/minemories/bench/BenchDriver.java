package dev.minemories.bench;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
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
 * then exports the grid tile by tile: the player stands at each tile's centre, the driver records which blocks
 * stayed in place and runs /minemories export around the tile. Minecraft draws a block entity only within 64
 * blocks of the camera, so a tile keeps every block well inside that. Outputs go next to the plan: tile-<n>.glb and
 * tile-<n>.json (each export), placed.json (what each cell holds, its tile), done.json. `bun mod bench` reads them.
 */
public final class BenchDriver implements ClientModInitializer {
  private static final Logger LOG = LoggerFactory.getLogger("minemories-bench");
  private static final int FLOOR = -60;
  private static final int PER_TICK = 200;
  /** Largest tile side in blocks: its corners stay within 64 blocks of the player standing at its centre. */
  private static final int TILE_SPAN = 80;

  private enum Step { MENU, LOADING, PLACING, SETTLING, ACTING, MOVING, EXPORTING, DONE }

  private Path plan;
  private JsonObject config;
  private Step step = Step.MENU;
  private int ticks;
  private final List<Cell> cells = new ArrayList<>();
  private int placed;
  private final List<Tile> tiles = new ArrayList<>();
  private int tile;
  private final JsonArray rows = new JsonArray();
  /** Blocks apart on the grid: 4 keeps a 3x3 block (a large water wheel) out of its neighbours' cells. */
  private int spacing = 4;
  private long exportStarted;

  private record Cell(BlockPos pos, ResourceLocation id, int tile) {}

  /** A square of the grid exported on its own, the player at (x, z), within `radius` blocks. */
  private record Tile(int x, int z, int radius, int minX, int minZ, int maxX, int maxZ) {}

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
        case MOVING -> moving(mc);
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
    int perTile = Math.max(1, TILE_SPAN / spacing);
    int tilesPerSide = (columns + perTile - 1) / perTile;
    for (int row = 0; row < tilesPerSide; row++)
      for (int col = 0; col < tilesPerSide; col++) {
        int minX = 4 + col * perTile * spacing, minZ = 4 + row * perTile * spacing;
        int maxX = minX + (perTile - 1) * spacing, maxZ = minZ + (perTile - 1) * spacing;
        // Its blocks and the ring around them, with a margin: never more than 44 blocks.
        int radius = (perTile - 1) * spacing / 2 + spacing + 2;
        tiles.add(new Tile((minX + maxX) / 2, (minZ + maxZ) / 2, radius, minX, minZ, maxX, maxZ));
      }
    for (int i = 0; i < ids.size(); i++) {
      int col = i % columns, row = i / columns;
      int index = (row / perTile) * tilesPerSide + col / perTile;
      cells.add(new Cell(new BlockPos(4 + col * spacing, FLOOR, 4 + row * spacing), ids.get(i), index));
    }
    LOG.info(
        "MINEMORIES-BENCH {} blocks from {} on a {}x{} grid, {} tiles", ids.size(), namespaces, columns, columns, tiles.size());
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
    if (ticks > 120) {
      tile = 0;
      next(Step.MOVING);
    }
  }

  /** The player goes to the tile's centre; the export waits until the client holds every chunk of the tile. */
  private void moving(Minecraft mc) {
    Tile current = tiles.get(tile);
    MinecraftServer server = mc.getSingleplayerServer();
    if (ticks == 1)
      server.execute(
          () -> server.getPlayerList().getPlayers().get(0).teleportTo(current.x() + 0.5, FLOOR + 1, current.z() + 0.5));
    boolean loaded = ticks > 40;
    for (int cx = (current.minX() - 2) >> 4; loaded && cx <= (current.maxX() + 2) >> 4; cx++)
      for (int cz = (current.minZ() - 2) >> 4; loaded && cz <= (current.maxZ() + 2) >> 4; cz++)
        loaded = mc.level.hasChunk(cx, cz);
    if (loaded && mc.player.blockPosition().getX() == current.x() && mc.player.blockPosition().getZ() == current.z()) {
      read(mc);
      export(mc);
    } else if (ticks > 20 * 120) throw new IllegalStateException("tile " + tile + " did not load");
  }

  /** What the world kept in this tile's cells, seen from the client that exports them. */
  private void read(Minecraft mc) {
    for (Cell cell : cells) {
      if (cell.tile() != tile) continue;
      JsonObject row = new JsonObject();
      row.addProperty("id", cell.id().toString());
      row.addProperty("x", cell.pos().getX());
      row.addProperty("y", cell.pos().getY());
      row.addProperty("z", cell.pos().getZ());
      row.addProperty("tile", cell.tile());
      row.addProperty("actual", BuiltInRegistries.BLOCK.getKey(mc.level.getBlockState(cell.pos()).getBlock()).toString());
      rows.add(row);
    }
  }

  private void export(Minecraft mc) {
    exportStarted = System.currentTimeMillis();
    var source = (FabricClientCommandSource) mc.getConnection().getSuggestionsProvider();
    try {
      ClientCommandManager.getActiveDispatcher().execute("minemories export " + tiles.get(tile).radius(), source);
    } catch (Exception error) {
      throw new IllegalStateException("export command failed", error);
    }
    next(Step.EXPORTING);
  }

  private void exporting(Minecraft mc) throws Exception {
    Path glb = Path.of(System.getProperty("user.home"), "export", "capture.glb");
    if (Files.exists(glb) && Files.getLastModifiedTime(glb).toMillis() >= exportStarted && ticks > 20) {
      // The next export replaces capture.glb: each tile's files are copied out first.
      Files.copy(glb, plan.resolveSibling("tile-" + tile + ".glb"), StandardCopyOption.REPLACE_EXISTING);
      Files.copy(
          glb.resolveSibling("capture.json"), plan.resolveSibling("tile-" + tile + ".json"), StandardCopyOption.REPLACE_EXISTING);
      if (++tile < tiles.size()) {
        next(Step.MOVING);
        return;
      }
      write("placed.json", placed(mc).toString());
      write("done.json", "{\"tiles\":" + tiles.size() + "}");
      LOG.info("MINEMORIES-BENCH DONE");
      next(Step.DONE);
      mc.stop();
    } else if (ticks > 20 * 600) throw new IllegalStateException("export of tile " + tile + " timed out");
  }

  private JsonObject placed(Minecraft mc) {
    JsonObject result = new JsonObject();
    result.add("cells", rows);
    long contraptions = 0;
    for (var entity : mc.level.entitiesForRendering())
      if (entity.getClass().getName().contains("Contraption")) contraptions++;
    result.addProperty("contraptions", contraptions);
    if (config.has("contraption") && config.get("contraption").getAsBoolean()) {
      JsonObject contraption = new JsonObject();
      contraption.addProperty("x", 1);
      contraption.addProperty("y", FLOOR + 1);
      contraption.addProperty("z", 1);
      contraption.addProperty("tile", 0);
      contraption.addProperty("id", "minecraft:white_wool");
      result.add("contraption", contraption);
    }
    JsonArray tileList = new JsonArray();
    for (Tile each : tiles) {
      JsonObject entry = new JsonObject();
      entry.addProperty("x", each.x());
      entry.addProperty("z", each.z());
      entry.addProperty("radius", each.radius());
      tileList.add(entry);
    }
    result.add("tiles", tileList);
    result.addProperty("spacing", spacing);
    // Flywheel and shaders behave differently on software rendering: every result says which renderer drew it.
    result.addProperty("renderer", com.mojang.blaze3d.platform.GlUtil.getRenderer());
    result.addProperty("minecraft", net.minecraft.SharedConstants.getCurrentVersion().getName());
    JsonObject mods = new JsonObject();
    for (var mod : net.fabricmc.loader.api.FabricLoader.getInstance().getAllMods())
      mods.addProperty(mod.getMetadata().getId(), mod.getMetadata().getVersion().getFriendlyString());
    result.add("mods", mods);
    return result;
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
