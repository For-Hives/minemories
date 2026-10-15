package dev.minemories.fabric.mixin;

import dev.minemories.client.ClientRuntime;
import net.minecraft.client.MouseHandler;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(MouseHandler.class)
abstract class MouseActivityMixin {
  @Inject(method = "onPress", at = @At("HEAD"))
  private void minemories$button(
      long window, int button, int action, int modifiers, CallbackInfo callback) {
    ClientRuntime.trackAfkMouse(action);
  }
}
