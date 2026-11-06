package dev.minemories.fabric.mixin;

import dev.minemories.client.ClientRuntime;
import net.minecraft.client.KeyboardHandler;
import net.minecraft.client.input.KeyEvent;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(KeyboardHandler.class)
abstract class KeyboardActivityMixin {
  @Inject(method = "keyPress", at = @At("HEAD"))
  private void minemories$key(
      long window, int action, KeyEvent event, CallbackInfo callback) {
    ClientRuntime.trackAfkKeyboard(action);
  }
}
