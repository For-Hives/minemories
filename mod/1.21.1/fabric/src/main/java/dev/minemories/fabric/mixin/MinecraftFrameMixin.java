package dev.minemories.fabric.mixin;

import dev.minemories.client.ClientRuntime;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Minecraft.class)
abstract class MinecraftFrameMixin {
  // Client ticks alone stop during pause; AFK must still progress on rendered frames.
  @Inject(method = "runTick", at = @At("TAIL"))
  private void minemories$frame(boolean renderLevel, CallbackInfo callback) {
    ClientRuntime.trackAfkSnapshot();
  }
}
