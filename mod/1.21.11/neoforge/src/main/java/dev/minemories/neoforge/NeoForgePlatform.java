package dev.minemories.neoforge;

import dev.minemories.client.ClientPlatform;
import java.io.IOException;
import java.util.Collection;
import java.util.function.Predicate;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FluidState;
import net.neoforged.neoforge.client.extensions.common.IClientFluidTypeExtensions;
import net.neoforged.neoforge.client.textures.FluidSpriteCache;

final class NeoForgePlatform implements ClientPlatform {
  @Override
  public void emitBlockModel(
      Minecraft minecraft,
      BlockState state,
      BlockEntity blockEntity,
      ModelRequest request,
      Predicate<Direction> visibleFace,
      QuadSink sink)
      throws IOException {
    var model = minecraft.getModelManager().getBlockModelShaper().getBlockModel(state);
    // Block entity data reaches the model through the level (IBlockGetterExtension#getModelData).
    var parts =
        model.collectParts(
            minecraft.level, request.pos(), state, RandomSource.create(request.seed()));
    for (var part : parts) {
      for (Direction face : Direction.values()) {
        if (!visibleFace.test(face)) continue;
        for (var quad : part.getQuads(face)) sink.accept(new ModelQuad(quad, face));
      }
      if (visibleFace.test(null))
        for (var quad : part.getQuads(null)) sink.accept(new ModelQuad(quad, null));
    }
  }

  @Override
  public TextureAtlasSprite[] fluidSprites(Minecraft minecraft, BlockPos pos, FluidState fluid) {
    return FluidSpriteCache.getFluidSprites(minecraft.level, pos, fluid);
  }

  @Override
  public int fluidTint(Minecraft minecraft, BlockPos pos, FluidState fluid) {
    return IClientFluidTypeExtensions.of(fluid).getTintColor(fluid, minecraft.level, pos);
  }

  @Override
  public Collection<TextureAtlasSprite> atlasSprites(TextureAtlas atlas) {
    return atlas.texturesByName.values();
  }

  @Override
  public int spritePixel(TextureAtlasSprite sprite, int x, int y) {
    int argb = sprite.contents().getOriginalImage().getPixel(x, y);
    return (argb & 0xFF00FF00) | ((argb >> 16) & 0xFF) | ((argb & 0xFF) << 16);
  }

  @Override
  public String modVersion() {
    return net.neoforged.fml.ModList.get()
        .getModContainerById("minemories")
        .map(container -> container.getModInfo().getVersion().toString())
        .orElse("unknown");
  }

  @Override
  public String loaderVersion() {
    return "neoforge-"
        + net.neoforged.neoforge.common.NeoForgeVersion.getVersion();
  }
}
