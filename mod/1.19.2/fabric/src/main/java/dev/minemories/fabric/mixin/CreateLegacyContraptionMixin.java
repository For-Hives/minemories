package dev.minemories.fabric.mixin;

import dev.minemories.client.CaptureRenderScope;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Create 0.5.1 skips the block entities and actors (shafts, drills, saws...) of a contraption that
 * Flywheel 0.6 instances, by asking {@code ContraptionRenderDispatcher.canInstance} rather than
 * {@code Backend.canUseInstancing}. Inside the capture they are drawn on the CPU like the rest.
 */
@Pseudo
@Mixin(
    targets = "com.simibubi.create.content.contraptions.render.ContraptionRenderDispatcher",
    remap = false)
public abstract class CreateLegacyContraptionMixin {
  // Optional API changes must not prevent startup; ContraptionStructure logs when the answer is
  // still true during a capture.
  @Inject(method = "canInstance", at = @At("HEAD"), cancellable = true, require = 0)
  private static void minemories$drawOnCpu(CallbackInfoReturnable<Boolean> result) {
    if (CaptureRenderScope.active()) result.setReturnValue(false);
  }
}
