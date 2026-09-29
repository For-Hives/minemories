package dev.minemories.neoforge;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import dev.minemories.core.GlbScene;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.lang.ref.WeakReference;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import javax.imageio.ImageIO;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.events.GuiEventListener;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderDispatcher;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.commands.Commands;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.tags.FluidTags;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.client.event.RegisterClientCommandsEvent;
import net.neoforged.neoforge.client.event.RenderLevelStageEvent;
import net.neoforged.neoforge.client.event.ScreenEvent;
import net.neoforged.neoforge.client.extensions.common.IClientFluidTypeExtensions;
import net.neoforged.neoforge.client.model.data.ModelData;
import net.neoforged.neoforge.client.textures.FluidSpriteCache;
import org.lwjgl.glfw.GLFW;

@Mod(value = "minemories", dist = net.neoforged.api.distmarker.Dist.CLIENT)
@EventBusSubscriber(
    modid = "minemories",
    bus = EventBusSubscriber.Bus.GAME,
    value = net.neoforged.api.distmarker.Dist.CLIENT)
public class Minemories {
  private static final int VERTEX_STRIDE = 8;
  private static WeakReference<Button> pauseButton = new WeakReference<>(null);
  private static BlockPos selectionFirst;
  private static BlockPos selectionSecond;
  private static ResourceKey<Level> selectionDimension;

  @SubscribeEvent
  public static void registerCommands(RegisterClientCommandsEvent event) {
    event
        .getDispatcher()
        .register(
            Commands.literal("minemories")
                .then(
                    Commands.literal("select")
                        .then(Commands.literal("first").executes(ctx -> selectCorner(true)))
                        .then(Commands.literal("second").executes(ctx -> selectCorner(false)))
                        .then(Commands.literal("clear").executes(ctx -> clearSelection()))
                        .then(Commands.literal("status").executes(ctx -> selectionStatus())))
                .then(
                    Commands.literal("export")
                        .executes(ctx -> exportSelection())
                        .then(
                            Commands.argument("radius", IntegerArgumentType.integer(2, 48))
                                .executes(
                                    ctx -> export(IntegerArgumentType.getInteger(ctx, "radius")))))
                .then(
                    Commands.literal("pair")
                        .then(
                            Commands.argument("code", StringArgumentType.word())
                                .executes(ctx -> pair(StringArgumentType.getString(ctx, "code")))))
                .then(Commands.literal("upload").executes(ctx -> uploadCapture())));
  }

  @SubscribeEvent
  public static void addPauseMenuButton(ScreenEvent.Init.Post event) {
    if (!(event.getScreen() instanceof PauseScreen screen)) return;
    Button button =
        Button.builder(
                Component.literal("Minemories"),
                pressed -> Minecraft.getInstance().setScreen(new MinemoriesScreen(screen)))
            .bounds(8, 8, PauseMenuPlacement.BUTTON_WIDTH, PauseMenuPlacement.BUTTON_HEIGHT)
            .build();
    event.addListener(button);
    pauseButton = new WeakReference<>(button);
    placePauseButton(screen, button, event.getListenersList());
  }

  @SubscribeEvent
  public static void repositionPauseMenuButton(ScreenEvent.Render.Pre event) {
    if (!(event.getScreen() instanceof PauseScreen screen)) return;
    Button button = pauseButton.get();
    if (button != null && screen.children().contains(button)) {
      placePauseButton(screen, button, screen.children());
    }
  }

  @SubscribeEvent
  public static void openFromPauseShortcut(ScreenEvent.KeyPressed.Post event) {
    if (!(event.getScreen() instanceof PauseScreen screen)
        || event.getKeyCode() != GLFW.GLFW_KEY_M
        || (event.getModifiers() & (GLFW.GLFW_MOD_CONTROL | GLFW.GLFW_MOD_SUPER)) == 0) return;
    Minecraft.getInstance().setScreen(new MinemoriesScreen(screen));
    event.setCanceled(true);
  }

  private static void placePauseButton(
      PauseScreen screen, Button button, List<? extends GuiEventListener> listeners) {
    List<PauseMenuPlacement.Rect> occupied = new ArrayList<>();
    for (GuiEventListener listener : listeners) {
      if (listener instanceof AbstractWidget widget && widget != button && widget.visible) {
        occupied.add(
            new PauseMenuPlacement.Rect(
                widget.getX(), widget.getY(), widget.getWidth(), widget.getHeight()));
      }
    }
    PauseMenuPlacement.Rect spot =
        PauseMenuPlacement.find(screen.width, screen.height, occupied);
    button.visible = spot != null;
    if (spot != null) {
      button.setX(spot.x());
      button.setY(spot.y());
      button.setWidth(spot.width());
    }
  }

  static boolean hasSelection() {
    Minecraft mc = Minecraft.getInstance();
    return mc.level != null
        && selectionFirst != null
        && selectionSecond != null
        && selectionDimension == mc.level.dimension();
  }

  static Path capturePath() {
    return Path.of(
        Objects.requireNonNull(System.getProperty("user.home"), "user.home"),
        "export",
        "capture.glb");
  }

  private static int pair(String code) {
    if (!code.matches("\\d{6}")) {
      tell("Entre le code à 6 chiffres affiché dans l’interface web.");
      return 0;
    }
    tell("Appairage en cours…");
    PairingClient.pair(code)
        .whenComplete(
            (message, error) ->
                Minecraft.getInstance()
                    .execute(() -> tell(error == null ? message : pairingError(error))));
    return 1;
  }

  private static int uploadCapture() {
    Path capture = capturePath();
    tell("Envoi de " + capture + "…");
    PairingClient.uploadCapture(capture)
        .whenComplete(
            (message, error) ->
                Minecraft.getInstance()
                    .execute(() -> tell(error == null ? message : pairingError(error))));
    return 1;
  }

  static String pairingError(Throwable error) {
    Throwable cause = error.getCause() == null ? error : error.getCause();
    return "Échec de la requête : " + cause.getMessage();
  }

  @SubscribeEvent
  public static void renderSelection(RenderLevelStageEvent event) {
    if (selectionFirst == null
        || selectionSecond == null
        || event.getStage() != RenderLevelStageEvent.Stage.AFTER_TRANSLUCENT_BLOCKS) return;
    Minecraft mc = Minecraft.getInstance();
    if (mc.level == null || selectionDimension != mc.level.dimension()) return;
    double x1 = Math.min(selectionFirst.getX(), selectionSecond.getX());
    double y1 = Math.min(selectionFirst.getY(), selectionSecond.getY());
    double z1 = Math.min(selectionFirst.getZ(), selectionSecond.getZ());
    double x2 = Math.max(selectionFirst.getX(), selectionSecond.getX()) + 1;
    double y2 = Math.max(selectionFirst.getY(), selectionSecond.getY()) + 1;
    double z2 = Math.max(selectionFirst.getZ(), selectionSecond.getZ()) + 1;
    Vec3 camera = event.getCamera().getPosition();
    PoseStack pose = event.getPoseStack();
    pose.pushPose();
    pose.translate(-camera.x, -camera.y, -camera.z);
    var buffers = mc.renderBuffers().bufferSource();
    VertexConsumer lines = buffers.getBuffer(RenderType.lines());
    LevelRenderer.renderLineBox(
        pose, lines, new AABB(x1, y1, z1, x2, y2, z2), 0.2f, 1f, 0.45f, 0.95f);
    pose.popPose();
    buffers.endBatch(RenderType.lines());
  }

  private static int selectCorner(boolean first) {
    Minecraft mc = Minecraft.getInstance();
    if (mc.level == null
        || mc.player == null
        || !(mc.hitResult instanceof BlockHitResult hit)
        || hit.getType() == HitResult.Type.MISS) {
      tell("Regarde un bloc puis relance /minemories select " + (first ? "first" : "second"));
      return 0;
    }
    if (selectionDimension != null && selectionDimension != mc.level.dimension()) {
      selectionFirst = null;
      selectionSecond = null;
    }
    selectionDimension = mc.level.dimension();
    if (first) selectionFirst = hit.getBlockPos().immutable();
    else selectionSecond = hit.getBlockPos().immutable();
    tell((first ? "Coin A" : "Coin B") + " défini: " + hit.getBlockPos().toShortString());
    if (selectionFirst != null && selectionSecond != null) {
      long sizeX = Math.abs(selectionFirst.getX() - selectionSecond.getX()) + 1L;
      long sizeY = Math.abs(selectionFirst.getY() - selectionSecond.getY()) + 1L;
      long sizeZ = Math.abs(selectionFirst.getZ() - selectionSecond.getZ()) + 1L;
      tell(
          "Zone: "
              + sizeX
              + " × "
              + sizeY
              + " × "
              + sizeZ
              + " blocs. /minemories export pour générer.");
    }
    return 1;
  }

  private static int clearSelection() {
    selectionFirst = null;
    selectionSecond = null;
    selectionDimension = null;
    tell("Sélection effacée.");
    return 1;
  }

  private static int selectionStatus() {
    if (selectionFirst == null || selectionSecond == null)
      tell("Sélection incomplète. Vise un bloc puis utilise /minemories select first et second.");
    else tell("A " + selectionFirst.toShortString() + " · B " + selectionSecond.toShortString());
    return 1;
  }

  private static void tell(String message) {
    Minecraft mc = Minecraft.getInstance();
    if (mc.player != null)
      mc.player.displayClientMessage(Component.literal("Minemories: " + message), false);
  }

  static int exportSelection() {
    Minecraft mc = Minecraft.getInstance();
    if (mc.level == null
        || selectionFirst == null
        || selectionSecond == null
        || selectionDimension != mc.level.dimension()) {
      tell("Sélectionne les coins avec /minemories select first puis second.");
      return 0;
    }
    BlockPos min =
        new BlockPos(
            Math.min(selectionFirst.getX(), selectionSecond.getX()),
            Math.min(selectionFirst.getY(), selectionSecond.getY()),
            Math.min(selectionFirst.getZ(), selectionSecond.getZ()));
    BlockPos max =
        new BlockPos(
            Math.max(selectionFirst.getX(), selectionSecond.getX()),
            Math.max(selectionFirst.getY(), selectionSecond.getY()),
            Math.max(selectionFirst.getZ(), selectionSecond.getZ()));
    return exportBox(min, max);
  }

  static int export(int radius) {
    Minecraft mc = Minecraft.getInstance();
    if (mc.level == null || mc.player == null) return 0;
    BlockPos center = mc.player.blockPosition();
    return exportBox(
        center.offset(-radius, -radius, -radius), center.offset(radius, radius, radius));
  }

  private static int exportBox(BlockPos min, BlockPos max) {
    Minecraft mc = Minecraft.getInstance();
    if (mc.level == null || mc.player == null) return 0;
    long sx = (long) max.getX() - min.getX() + 1,
        sy = (long) max.getY() - min.getY() + 1,
        sz = (long) max.getZ() - min.getZ() + 1;
    if (sx > 97 || sy > 97 || sz > 97 || sx * sy * sz > 1_000_000L) {
      tell("Zone trop grande. Maximum: 97 blocs par axe.");
      return 0;
    }
    BlockPos center =
        new BlockPos(
            (min.getX() + max.getX()) / 2,
            (min.getY() + max.getY()) / 2,
            (min.getZ() + max.getZ()) / 2);
    GlbScene scene = new GlbScene();
    Map<String, SpriteAsset> sprites = new LinkedHashMap<>();
    TextureAtlas blockAtlas =
        Objects.requireNonNull(
            mc.getModelManager().getAtlas(TextureAtlas.LOCATION_BLOCKS),
            "Block atlas unavailable during export");
    List<TextureAtlasSprite> atlasSprites = new ArrayList<>(blockAtlas.getTextures().values());
    Path output = capturePath();
    Path outputDirectory = output.getParent();
    try {
      Files.createDirectories(outputDirectory);
      BlockEntityRenderDispatcher beRenderer = mc.getBlockEntityRenderDispatcher();
      beRenderer.prepare(mc.level, mc.gameRenderer.getMainCamera(), mc.hitResult);
      int blockCount = 0;
      for (int y = min.getY(); y <= max.getY(); y++)
        for (int z = min.getZ(); z <= max.getZ(); z++)
          for (int x = min.getX(); x <= max.getX(); x++) {
            BlockPos pos = new BlockPos(x, y, z);
            if (!mc.level.hasChunkAt(pos)) continue;
            BlockState state = mc.level.getBlockState(pos);
            if (state.isAir()) continue;
            int lightEmission = state.getLightEmission();
            if (lightEmission >= 4) {
              // Map colors describe the block's minimap swatch and are
              // often dark brown/black for lamps. Use a useful light tint.
              String blockName = BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString();
              int lightColor =
                  blockName.contains("soul")
                      ? 0xA8DFFF
                      : (blockName.contains("lava")
                              || blockName.contains("fire")
                              || blockName.contains("blaze"))
                          ? 0xFFFFD8
                          : 0xFFF0D0;
              scene.addPointLight(
                  x - center.getX() + 0.5f,
                  y - center.getY() + 0.5f,
                  z - center.getZ() + 0.5f,
                  lightColor,
                  lightEmission);
            }
            if (state.getRenderShape() != RenderShape.INVISIBLE) {
              String id = BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString();
              BakedModel model = mc.getModelManager().getBlockModelShaper().getBlockModel(state);
              BlockEntity blockEntity = mc.level.getBlockEntity(pos);
              ModelData initialData =
                  blockEntity == null ? ModelData.EMPTY : blockEntity.getModelData();
              ModelData modelData = model.getModelData(mc.level, pos, state, initialData);
              for (Direction direction : Direction.values()) {
                BlockPos neighborPos = pos.relative(direction);
                if (mc.level.hasChunkAt(neighborPos)
                    && !Block.shouldRenderFace(state, mc.level, pos, direction, neighborPos))
                  continue;
                RandomSource random = RandomSource.create(state.getSeed(pos));
                for (BakedQuad quad : model.getQuads(state, direction, random, modelData, null))
                  addQuad(
                      scene,
                      sprites,
                      mc,
                      state,
                      pos,
                      id,
                      quad,
                      x - center.getX(),
                      y - center.getY(),
                      z - center.getZ());
              }
              RandomSource random = RandomSource.create(state.getSeed(pos));
              for (BakedQuad quad : model.getQuads(state, null, random, modelData, null))
                addQuad(
                    scene,
                    sprites,
                    mc,
                    state,
                    pos,
                    id,
                    quad,
                    x - center.getX(),
                    y - center.getY(),
                    z - center.getZ());
              if (blockEntity != null)
                captureBlockEntityRenderer(
                    scene,
                    sprites,
                    atlasSprites,
                    mc,
                    beRenderer,
                    blockEntity,
                    x - center.getX(),
                    y - center.getY(),
                    z - center.getZ());
              blockCount++;
            }
            FluidState fluid = state.getFluidState();
            if (!fluid.isEmpty()) captureFluid(scene, sprites, mc, pos, state, fluid, center);
          }
      scene.write(output);
      mc.player.displayClientMessage(
          Component.literal(
              "Minemories: "
                  + blockCount
                  + " blocs / "
                  + scene.materialCount()
                  + " matériaux texturés exportés vers "
                  + output),
          false);
    } catch (Exception e) {
      mc.player.displayClientMessage(
          Component.literal("Minemories: échec export: " + e.getMessage()), false);
      e.printStackTrace();
      return 0;
    }
    return 1;
  }

  private static void addQuad(
      GlbScene scene,
      Map<String, SpriteAsset> sprites,
      Minecraft mc,
      BlockState state,
      BlockPos pos,
      String blockId,
      BakedQuad quad,
      int x,
      int y,
      int z)
      throws IOException {
    TextureAtlasSprite sprite = quad.getSprite();
    String imageKey = sprite.contents().name().toString();
    SpriteAsset asset = sprites.get(imageKey);
    if (asset == null) {
      asset = new SpriteAsset(sprite);
      sprites.put(imageKey, asset);
    }
    int tint =
        quad.isTinted()
            ? mc.getBlockColors().getColor(state, mc.level, pos, quad.getTintIndex())
            : 0xFFFFFF;
    if (tint < 0) tint = 0xFFFFFF;
    int blockLight = 0;
    int[] packed = quad.getVertices();
    float[] xyz = new float[12], uv = new float[8];
    float ur = sprite.getU1() - sprite.getU0(), vr = sprite.getV1() - sprite.getV0();
    for (int vertex = 0; vertex < 4; vertex++) {
      int base = vertex * VERTEX_STRIDE;
      xyz[vertex * 3] = Float.intBitsToFloat(packed[base]) + x;
      xyz[vertex * 3 + 1] = Float.intBitsToFloat(packed[base + 1]) + y;
      xyz[vertex * 3 + 2] = Float.intBitsToFloat(packed[base + 2]) + z;
      float u = Float.intBitsToFloat(packed[base + 4]), v = Float.intBitsToFloat(packed[base + 5]);
      uv[vertex * 2] = ur == 0 ? 0 : (u - sprite.getU0()) / ur;
      uv[vertex * 2 + 1] = vr == 0 ? 0 : (v - sprite.getV0()) / vr;
      blockLight = Math.max(blockLight, (packed[base + 6] >>> 4) & 15);
    }
    float emission = Math.max(state.getLightEmission(), blockLight) / 15f;
    String key = imageKey + "#" + String.format("%06x", tint & 0xFFFFFF) + "#" + emission;
    scene.addQuad(
        key,
        blockId + " / " + imageKey,
        imageKey,
        asset.png,
        tint,
        asset.alphaMode,
        emission,
        1f,
        xyz,
        uv);
  }

  private static void captureFluid(
      GlbScene scene,
      Map<String, SpriteAsset> sprites,
      Minecraft mc,
      BlockPos pos,
      BlockState block,
      FluidState fluid,
      BlockPos center)
      throws IOException {
    TextureAtlasSprite[] fluidSprites = FluidSpriteCache.getFluidSprites(mc.level, pos, fluid);
    if (fluidSprites == null || fluidSprites.length == 0 || fluidSprites[0] == null) return;
    FluidVertexConsumer consumer = new FluidVertexConsumer();
    mc.getBlockRenderer().renderLiquid(pos, mc.level, consumer, block, fluid);
    int tint = IClientFluidTypeExtensions.of(fluid).getTintColor(fluid, mc.level, pos);
    if ((tint & 0xFFFFFF) == 0) tint = 0xFFFFFFFF;
    float opacity =
        fluid.is(FluidTags.WATER) ? 0.72f : Math.max(0.65f, ((tint >>> 24) & 255) / 255f);
    float emission = block.getLightEmission() / 15f;
    String fluidId = BuiltInRegistries.FLUID.getKey(fluid.getType()).toString();
    int sectionX = pos.getX() & ~15, sectionY = pos.getY() & ~15, sectionZ = pos.getZ() & ~15;
    for (int q = 0; q + 3 < consumer.vertices.size(); q += 4) {
      FluidVertex[] quad = {
        consumer.vertices.get(q),
        consumer.vertices.get(q + 1),
        consumer.vertices.get(q + 2),
        consumer.vertices.get(q + 3)
      };
      TextureAtlasSprite sprite = selectFluidSprite(fluidSprites, quad);
      if (sprite == null) sprite = fluidSprites[0];
      String imageKey = sprite.contents().name().toString();
      SpriteAsset asset = sprites.get(imageKey);
      if (asset == null) {
        asset = new SpriteAsset(sprite);
        sprites.put(imageKey, asset);
      }
      float[] xyz = new float[12], uv = new float[8];
      float ur = sprite.getU1() - sprite.getU0(), vr = sprite.getV1() - sprite.getV0();
      for (int v = 0; v < 4; v++) {
        FluidVertex vertex = quad[v];
        xyz[v * 3] = sectionX + vertex.x - center.getX();
        xyz[v * 3 + 1] = sectionY + vertex.y - center.getY();
        xyz[v * 3 + 2] = sectionZ + vertex.z - center.getZ();
        uv[v * 2] = ur == 0 ? 0 : (vertex.u - sprite.getU0()) / ur;
        uv[v * 2 + 1] = vr == 0 ? 0 : (vertex.v - sprite.getV0()) / vr;
      }
      String key =
          "fluid#" + fluidId + "#" + imageKey + "#" + String.format("%06x", tint & 0xFFFFFF);
      scene.addQuad(
          key,
          fluidId + " / " + imageKey,
          imageKey,
          asset.png,
          tint & 0xFFFFFF,
          2,
          emission,
          opacity,
          xyz,
          uv);
    }
  }

  private static TextureAtlasSprite selectFluidSprite(
      TextureAtlasSprite[] sprites, FluidVertex[] vertices) {
    for (TextureAtlasSprite sprite : sprites) {
      if (sprite == null) continue;
      boolean inside = true;
      for (FluidVertex vertex : vertices) {
        if (vertex.u < sprite.getU0() - 0.0001f
            || vertex.u > sprite.getU1() + 0.0001f
            || vertex.v < sprite.getV0() - 0.0001f
            || vertex.v > sprite.getV1() + 0.0001f) {
          inside = false;
          break;
        }
      }
      if (inside) return sprite;
    }
    return null;
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  private static void captureBlockEntityRenderer(
      GlbScene scene,
      Map<String, SpriteAsset> sprites,
      List<TextureAtlasSprite> atlasSprites,
      Minecraft mc,
      BlockEntityRenderDispatcher dispatcher,
      BlockEntity blockEntity,
      int x,
      int y,
      int z)
      throws IOException {
    FluidVertexConsumer consumer = new FluidVertexConsumer();
    MultiBufferSource buffers = renderType -> consumer;
    PoseStack pose = new PoseStack();
    pose.translate(x, y, z);
    dispatcher.render(blockEntity, 0f, pose, buffers);
    for (int offset = 0; offset + 3 < consumer.vertices.size(); offset += 4) {
      FluidVertex[] quad = {
        consumer.vertices.get(offset),
        consumer.vertices.get(offset + 1),
        consumer.vertices.get(offset + 2),
        consumer.vertices.get(offset + 3)
      };
      TextureAtlasSprite sprite = findAtlasSprite(atlasSprites, quad);
      if (sprite == null) continue;
      String imageKey = sprite.contents().name().toString();
      SpriteAsset asset = sprites.get(imageKey);
      if (asset == null) {
        asset = new SpriteAsset(sprite);
        sprites.put(imageKey, asset);
      }
      float ur = sprite.getU1() - sprite.getU0(), vr = sprite.getV1() - sprite.getV0();
      float[] xyz = new float[12], uv = new float[8];
      int r = 0, g = 0, b = 0, a = 0;
      for (int i = 0; i < 4; i++) {
        FluidVertex vertex = quad[i];
        xyz[i * 3] = vertex.x;
        xyz[i * 3 + 1] = vertex.y;
        xyz[i * 3 + 2] = vertex.z;
        uv[i * 2] = ur == 0 ? 0 : (vertex.u - sprite.getU0()) / ur;
        uv[i * 2 + 1] = vr == 0 ? 0 : (vertex.v - sprite.getV0()) / vr;
        r += vertex.r;
        g += vertex.g;
        b += vertex.b;
        a += vertex.a;
      }
      int tint = ((r / 4) << 16) | ((g / 4) << 8) | (b / 4);
      float opacity = Math.max(0f, Math.min(1f, a / (4f * 255f)));
      int alphaMode = opacity < 1f ? 2 : asset.alphaMode;
      int emission = blockEntity.getBlockState().getLightEmission();
      String key = "be#" + imageKey + "#" + Integer.toHexString(tint);
      scene.addQuad(
          key,
          BuiltInRegistries.BLOCK_ENTITY_TYPE.getKey(blockEntity.getType()) + " / " + imageKey,
          imageKey,
          asset.png,
          tint,
          alphaMode,
          emission / 15f,
          opacity,
          xyz,
          uv);
    }
  }

  private static TextureAtlasSprite findAtlasSprite(
      List<TextureAtlasSprite> sprites, FluidVertex[] quad) {
    TextureAtlasSprite best = null;
    float bestArea = Float.MAX_VALUE;
    for (TextureAtlasSprite sprite : sprites) {
      boolean inside = true;
      for (FluidVertex vertex : quad) {
        if (vertex.u < sprite.getU0() - 0.0001f
            || vertex.u > sprite.getU1() + 0.0001f
            || vertex.v < sprite.getV0() - 0.0001f
            || vertex.v > sprite.getV1() + 0.0001f) {
          inside = false;
          break;
        }
      }
      if (inside) {
        float area = (sprite.getU1() - sprite.getU0()) * (sprite.getV1() - sprite.getV0());
        if (area < bestArea) {
          best = sprite;
          bestArea = area;
        }
      }
    }
    return best;
  }

  private static class FluidVertexConsumer implements VertexConsumer {
    final java.util.ArrayList<FluidVertex> vertices = new java.util.ArrayList<>();
    private FluidVertex current;

    @Override
    public VertexConsumer addVertex(float x, float y, float z) {
      current = new FluidVertex(x, y, z);
      vertices.add(current);
      return this;
    }

    @Override
    public VertexConsumer setColor(int r, int g, int b, int a) {
      current.r = r;
      current.g = g;
      current.b = b;
      current.a = a;
      return this;
    }

    @Override
    public VertexConsumer setUv(float u, float v) {
      current.u = u;
      current.v = v;
      return this;
    }

    @Override
    public VertexConsumer setUv1(int u, int v) {
      return this;
    }

    @Override
    public VertexConsumer setUv2(int u, int v) {
      return this;
    }

    @Override
    public VertexConsumer setNormal(float x, float y, float z) {
      return this;
    }
  }

  private static final class FluidVertex {
    final float x, y, z;
    float u, v;
    int r = 255, g = 255, b = 255, a = 255;

    FluidVertex(float x, float y, float z) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  }

  private static final class SpriteAsset {
    final byte[] png;
    final int alphaMode;

    SpriteAsset(TextureAtlasSprite sprite) throws IOException {
      BufferedImage image =
          new BufferedImage(
              sprite.contents().width(), sprite.contents().height(), BufferedImage.TYPE_INT_ARGB);
      boolean transparent = false, translucent = false;
      for (int py = 0; py < image.getHeight(); py++)
        for (int px = 0; px < image.getWidth(); px++) {
          int pixel = sprite.getPixelRGBA(0, px, py), alpha = pixel >>> 24;
          transparent |= alpha == 0;
          translucent |= alpha != 0 && alpha != 255;
          image.setRGB(
              px,
              py,
              (alpha << 24)
                  | ((pixel & 255) << 16)
                  | (pixel & 0x0000FF00)
                  | ((pixel >>> 16) & 255));
        }
      alphaMode = translucent ? 2 : transparent ? 1 : 0;
      ByteArrayOutputStream bytes = new ByteArrayOutputStream();
      ImageIO.write(image, "png", bytes);
      png = bytes.toByteArray();
    }
  }
}
