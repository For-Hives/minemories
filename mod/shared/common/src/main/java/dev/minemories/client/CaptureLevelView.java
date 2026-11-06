package dev.minemories.client;

import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.BlockAndTintGetter;
import net.minecraft.world.level.ColorResolver;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.lighting.LevelLightEngine;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.Fluids;

/** A read-only rendering view: neighbors outside the exported box cannot hide fluid cut faces. */
record CaptureLevelView(BlockAndTintGetter world, CaptureBounds bounds)
    implements BlockAndTintGetter {
  private boolean outside(BlockPos pos) {
    return CutBoundary.outside(bounds, pos.getX(), pos.getY(), pos.getZ());
  }

  @Override
  public BlockState getBlockState(BlockPos pos) {
    return outside(pos) ? Blocks.AIR.defaultBlockState() : world.getBlockState(pos);
  }

  @Override
  public FluidState getFluidState(BlockPos pos) {
    return outside(pos) ? Fluids.EMPTY.defaultFluidState() : world.getFluidState(pos);
  }

  @Override
  public BlockEntity getBlockEntity(BlockPos pos) {
    return outside(pos) ? null : world.getBlockEntity(pos);
  }

  @Override
  public float getShade(Direction direction, boolean shade) {
    return world.getShade(direction, shade);
  }

  @Override
  public LevelLightEngine getLightEngine() {
    return world.getLightEngine();
  }

  @Override
  public int getBlockTint(BlockPos pos, ColorResolver resolver) {
    return world.getBlockTint(pos, resolver);
  }

  @Override
  public int getHeight() {
    return world.getHeight();
  }

  @Override
  public int getMinBuildHeight() {
    return world.getMinBuildHeight();
  }
}
