package dev.minemories.fabric;

import dev.minemories.client.ClientPlatform;
import dev.minemories.fabric.mixin.SpriteContentsAccess;
import dev.minemories.fabric.mixin.TextureAtlasAccess;
import java.io.IOException;
import java.util.Collection;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.client.render.fluid.v1.FluidRenderHandlerRegistry;
import net.fabricmc.fabric.api.renderer.v1.model.FabricBakedModel;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.material.FluidState;

final class FabricPlatform implements ClientPlatform {
  @Override
  public void emitBlockModel(
      Minecraft minecraft,
      net.minecraft.world.level.block.state.BlockState state,
      net.minecraft.world.level.block.entity.BlockEntity blockEntity,
      ModelRequest request,
      Predicate<Direction> visibleFace,
      QuadSink sink)
      throws IOException {
    var model = minecraft.getModelManager().getBlockModelShaper().getBlockModel(state);
    var fabric = (FabricBakedModel) model;
    if (!fabric.isVanillaAdapter()) {
      new FabricModelCapture(minecraft, state, request, visibleFace, sink).capture(fabric);
      return;
    }
    for (Direction face : Direction.values()) {
      if (!visibleFace.test(face)) continue;
      for (var quad : model.getQuads(state, face, RandomSource.create(request.seed())))
        sink.accept(new ModelQuad(quad, face));
    }
    if (visibleFace.test(null))
      for (var quad : model.getQuads(state, null, RandomSource.create(request.seed())))
        sink.accept(new ModelQuad(quad, null));
  }

  @Override
  public TextureAtlasSprite[] fluidSprites(Minecraft minecraft, BlockPos pos, FluidState fluid) {
    var handler = FluidRenderHandlerRegistry.INSTANCE.get(fluid.getType());
    return handler == null
        ? new TextureAtlasSprite[0]
        : handler.getFluidSprites(minecraft.level, pos, fluid);
  }

  @Override
  public int fluidTint(Minecraft minecraft, BlockPos pos, FluidState fluid) {
    var handler = FluidRenderHandlerRegistry.INSTANCE.get(fluid.getType());
    int color = handler == null ? -1 : handler.getFluidColor(minecraft.level, pos, fluid);
    return (color >>> 24) == 0 ? color | 0xFF000000 : color;
  }

  @Override
  public Collection<TextureAtlasSprite> atlasSprites(TextureAtlas atlas) {
    if (!(atlas instanceof TextureAtlasAccess access))
      throw new IllegalStateException("Texture atlas accessor not installed");
    return access.minemories$sprites().values();
  }

  @Override
  public int spritePixel(TextureAtlasSprite sprite, int x, int y) {
    if (!(sprite.contents() instanceof SpriteContentsAccess access))
      throw new IllegalStateException("Sprite accessor not installed");
    return access.minemories$image().getPixelRGBA(x, y);
  }

  @Override
  public String modVersion() {
    return version("minemories");
  }

  @Override
  public String loaderVersion() {
    String loader =
        FabricLoader.getInstance().isModLoaded("quilt_loader") ? "quilt_loader" : "fabricloader";
    return (loader.equals("quilt_loader") ? "quilt-" : "fabric-") + version(loader);
  }

  private static String version(String id) {
    return FabricLoader.getInstance()
        .getModContainer(id)
        .map(container -> container.getMetadata().getVersion().getFriendlyString())
        .orElse("unknown");
  }
}
