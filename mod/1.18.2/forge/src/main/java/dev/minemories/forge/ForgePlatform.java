package dev.minemories.forge;

import dev.minemories.client.ClientPlatform;
import java.io.IOException;
import java.util.Collection;
import java.util.function.Predicate;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FluidState;
import net.minecraftforge.client.ForgeHooksClient;
import net.minecraftforge.client.model.data.EmptyModelData;
import net.minecraftforge.client.model.data.IModelData;

final class ForgePlatform implements ClientPlatform {
  @Override
  public void emitBlockModel(
      Minecraft minecraft,
      BlockState state,
      BlockEntity blockEntity,
      ModelRequest request,
      Predicate<Direction> visibleFace,
      QuadSink sink)
      throws IOException {
    var pos = request.pos();
    var model = minecraft.getModelManager().getBlockModelShaper().getBlockModel(state);
    IModelData initial = blockEntity == null ? EmptyModelData.INSTANCE : blockEntity.getModelData();
    IModelData data =
        request.foundation()
            ? EmptyModelData.INSTANCE
            : model.getModelData(minecraft.level, pos, state, initial);
    for (Direction face : Direction.values()) {
      if (!visibleFace.test(face)) continue;
      for (var quad : model.getQuads(state, face, new java.util.Random(request.seed()), data))
        sink.accept(new ModelQuad(quad, face));
    }
    if (visibleFace.test(null))
      for (var quad : model.getQuads(state, null, new java.util.Random(request.seed()), data))
        sink.accept(new ModelQuad(quad, null));
  }

  @Override
  public TextureAtlasSprite[] fluidSprites(Minecraft minecraft, BlockPos pos, FluidState fluid) {
    return ForgeHooksClient.getFluidSprites(minecraft.level, pos, fluid);
  }

  @Override
  public int fluidTint(Minecraft minecraft, BlockPos pos, FluidState fluid) {
    return fluid.getType().getAttributes().getColor(minecraft.level, pos);
  }

  @Override
  public Collection<TextureAtlasSprite> atlasSprites(TextureAtlas atlas) {
    return atlas.texturesByName.values();
  }

  @Override
  public int spritePixel(TextureAtlasSprite sprite, int x, int y) {
    return sprite.getPixelRGBA(0, x, y);
  }

  @Override
  public String modVersion() {
    return net.minecraftforge.fml.ModList.get()
        .getModContainerById("minemories")
        .map(container -> container.getModInfo().getVersion().toString())
        .orElse("unknown");
  }

  @Override
  public String loaderVersion() {
    return "forge-" + net.minecraftforge.versions.forge.ForgeVersion.getVersion();
  }
}
