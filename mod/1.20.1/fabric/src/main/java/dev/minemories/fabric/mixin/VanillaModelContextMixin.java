package dev.minemories.fabric.mixin;

import dev.minemories.fabric.VanillaModelCapture;
import java.util.function.Supplier;
import net.fabricmc.fabric.api.renderer.v1.render.RenderContext;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.core.BlockPos;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.BlockAndTintGetter;
import net.minecraft.world.level.block.state.BlockState;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The renderer (Indigo, or Indium with Sodium) gives every vanilla model an emitBlockQuads that
 * casts the RenderContext to its own class. A model that delegates to a vanilla model inside a
 * Minemories capture (a copycat block) must not reach that cast. Applied after the renderer's own
 * mixin (priority 1500); not required, so a renderer that changes this never stops the game.
 */
@Mixin(value = BakedModel.class, priority = 1500)
public interface VanillaModelContextMixin {
  @Inject(
      method = "emitBlockQuads",
      at = @At("HEAD"),
      cancellable = true,
      remap = false,
      require = 0)
  private void minemories$emitIntoCapture(
      BlockAndTintGetter view,
      BlockState state,
      BlockPos pos,
      Supplier<RandomSource> random,
      RenderContext context,
      CallbackInfo info) {
    if (VanillaModelCapture.emit((BakedModel) (Object) this, state, context)) info.cancel();
  }
}
