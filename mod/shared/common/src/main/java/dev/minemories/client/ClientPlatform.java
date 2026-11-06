package dev.minemories.client;

import java.io.IOException;
import java.util.Collection;
import java.util.function.Predicate;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.FluidState;

/** Loader hooks remain outside the shared capture and its client-thread state. */
public interface ClientPlatform {
  record ModelQuad(
      BakedQuad baked, Direction cullFace, int argb, boolean emissive, boolean translucent) {
    public ModelQuad(BakedQuad baked, Direction cullFace) {
      this(baked, cullFace, 0xFFFFFFFF, false, false);
    }
  }

  record ModelRequest(BlockPos pos, long seed, boolean foundation) {
    public ModelRequest {
      pos = pos.immutable();
    }
  }

  @FunctionalInterface
  interface QuadSink {
    void accept(ModelQuad quad) throws IOException;
  }

  /** A null cull face denotes unculled geometry. Foundation models use their fixed seed. */
  void emitBlockModel(
      Minecraft minecraft,
      BlockState state,
      BlockEntity blockEntity,
      ModelRequest request,
      Predicate<Direction> visibleFace,
      QuadSink sink)
      throws IOException;

  TextureAtlasSprite[] fluidSprites(Minecraft minecraft, BlockPos pos, FluidState fluid);

  int fluidTint(Minecraft minecraft, BlockPos pos, FluidState fluid);

  Collection<TextureAtlasSprite> atlasSprites(TextureAtlas atlas);

  int spritePixel(TextureAtlasSprite sprite, int x, int y);

  String modVersion();

  String loaderVersion();
}
