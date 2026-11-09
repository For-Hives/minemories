package dev.minemories.fabric;

import dev.minemories.client.ClientPlatform;
import dev.minemories.fabric.mixin.SpriteContentsAccess;
import dev.minemories.fabric.mixin.TextureAtlasAccess;
import java.io.IOException;
import java.util.Collection;
import java.util.function.Predicate;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
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
    var model = minecraft.getModelManager().getBlockStateModelSet().get(state);
    new FabricModelCapture(minecraft, state, request, visibleFace, sink).capture(model);
  }

  @Override
  public TextureAtlasSprite[] fluidSprites(Minecraft minecraft, BlockPos pos, FluidState fluid) {
    var model = minecraft.getModelManager().getFluidStateModelSet().get(fluid);
    if (model == null) return new TextureAtlasSprite[0];
    return new TextureAtlasSprite[] {
      model.stillMaterial().sprite(), model.flowingMaterial().sprite()
    };
  }

  @Override
  public int fluidTint(Minecraft minecraft, BlockPos pos, FluidState fluid) {
    var model = minecraft.getModelManager().getFluidStateModelSet().get(fluid);
    var source = model == null ? null : model.tintSource();
    int color =
        source == null
            ? -1
            : source.colorInWorld(fluid.createLegacyBlock(), minecraft.level, pos);
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
    // NativeImage.getPixel is ARGB in Minecraft 26.3 (it was read as ABGR before); the shared capture reads ABGR (red in the low byte).
    int argb = access.minemories$image().getPixel(x, y);
    return (argb & 0xFF00FF00) | ((argb & 0xFF) << 16) | ((argb >> 16) & 0xFF);
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
