package dev.minemories.fabric.mixin;

import dev.minemories.client.ClientRuntime;
import net.minecraft.client.MouseHandler;
import net.minecraft.client.input.MouseButtonInfo;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MouseHandler.class)
abstract class MouseActivityMixin {
  @Inject(method = "onButton", at = @At("HEAD"))
  private void minemories$button(
      long window, MouseButtonInfo button, int action, CallbackInfo callback) {
    ClientRuntime.trackAfkMouse(action);
  }
}
