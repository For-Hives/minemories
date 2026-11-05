package dev.minemories.neoforge.mixin;

import dev.minemories.client.CaptureRenderScope;
import net.minecraft.world.level.LevelAccessor;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Pseudo
@Mixin(targets = "dev.engine_room.flywheel.impl.FlwApiLinkImpl", remap = false)
public abstract class FlywheelCaptureMixin {
  // Optional API changes must not prevent startup. FlywheelCaptureBridge rejects capture if the
  // active backend does not yield to the CPU renderer, instead of saving a model with missing
  // parts.
  @Inject(
      method = "supportsVisualization(Lnet/minecraft/world/level/LevelAccessor;)Z",
      at = @At("HEAD"),
      cancellable = true,
      require = 0)
  private void minemories$useCpuRenderer(
      LevelAccessor level, CallbackInfoReturnable<Boolean> result) {
    if (CaptureRenderScope.active()) result.setReturnValue(false);
  }
}
