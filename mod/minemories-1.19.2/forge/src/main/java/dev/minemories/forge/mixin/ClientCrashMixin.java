package dev.minemories.forge.mixin;

import dev.minemories.client.DiagnosticCrashHook;
import net.minecraft.CrashReport;
import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

// No refmap: Forge 1.19.2 runs on SRG names, so the target is spelled m_91332_ (Minecraft.crash).
@Mixin(value = Minecraft.class, remap = false)
public abstract class ClientCrashMixin {
  @Inject(method = "m_91332_", at = @At("HEAD"))
  private static void minemories$recordCrash(CrashReport report, CallbackInfo callback) {
    DiagnosticCrashHook.record(report.getException());
  }
}
