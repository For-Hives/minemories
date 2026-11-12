package dev.minemories.fabric.mixin;

import dev.minemories.fabric.VanillaModelCapture;
import net.fabricmc.fabric.api.renderer.v1.mesh.Mesh;
import net.fabricmc.fabric.api.renderer.v1.mesh.QuadEmitter;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Pseudo;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The renderer's Mesh.outputTo casts its target to the renderer's own emitter; a mesh output to the
 * capture's emitter (Copycats+ copycats) must be copied quad by quad instead. Indigo and Indium are
 * both targeted by name; neither is required.
 */
@Pseudo
@Mixin(
    targets = {
      "net.fabricmc.fabric.impl.client.indigo.renderer.mesh.MeshImpl",
      "link.infra.indium.renderer.mesh.MeshImpl"
    },
    remap = false)
public abstract class MeshOutputMixin {
  @Inject(method = "outputTo", at = @At("HEAD"), cancellable = true, require = 0)
  private void minemories$outputToCapture(QuadEmitter target, CallbackInfo info) {
    if (VanillaModelCapture.output((Mesh) (Object) this, target)) info.cancel();
  }
}
