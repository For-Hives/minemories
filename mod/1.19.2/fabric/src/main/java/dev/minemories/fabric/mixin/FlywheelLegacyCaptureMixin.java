package dev.minemories.fabric.mixin;

import dev.minemories.client.CaptureRenderScope;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Flywheel 0.6, bundled with Create 0.5.1: its renderers (tracks, shafts, cogs, belts, bogeys...)
 * return without drawing while instancing is on, so the capture would miss them.
 */
@Pseudo
@Mixin(targets = "com.jozufozu.flywheel.backend.Backend", remap = false)
public abstract class FlywheelLegacyCaptureMixin {
  // Optional API changes must not prevent startup. FlywheelCaptureBridge rejects capture if the
  // backend does not yield to the CPU renderer, instead of saving a model with missing parts.
  @Inject(method = "canUseInstancing", at = @At("HEAD"), cancellable = true, require = 0)
  private static void minemories$useCpuRenderer(
      Level level, CallbackInfoReturnable<Boolean> result) {
    if (CaptureRenderScope.active()) result.setReturnValue(false);
  }
}
