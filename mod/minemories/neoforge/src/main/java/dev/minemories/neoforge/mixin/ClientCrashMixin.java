package dev.minemories.neoforge.mixin;

import dev.minemories.neoforge.DiagnosticCrashHook;
import java.io.File;
import net.minecraft.CrashReport;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Minecraft.class)
public abstract class ClientCrashMixin {
  @Inject(method = "crash", at = @At("HEAD"))
  private static void minemories$recordCrash(
      Minecraft client, File directory, CrashReport report, CallbackInfo callback) {
    DiagnosticCrashHook.record(report.getException());
  }
}
