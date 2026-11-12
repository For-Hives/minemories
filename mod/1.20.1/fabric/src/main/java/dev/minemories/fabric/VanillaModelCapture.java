package dev.minemories.fabric;

import net.fabricmc.fabric.api.renderer.v1.mesh.Mesh;
import net.fabricmc.fabric.api.renderer.v1.mesh.QuadEmitter;
import net.fabricmc.fabric.api.renderer.v1.render.RenderContext;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Lets models that hand the capture's {@link RenderContext} or emitter to renderer code reach the
 * capture (copycat blocks draw the copied block this way, then cut it in a mesh of their own).
 */
public final class VanillaModelCapture {
  private VanillaModelCapture() {}

  /**
   * Fabric API 0.92's Indigo casts the context of every vanilla model to its own class, so a
   * copycat failed with a ClassCastException and came out empty. Inside a capture, the vanilla
   * model's quads go through the capture's own consumer instead (transforms and culling apply).
   *
   * @return true when the capture took the model, false to let the renderer draw it
   */
  public static boolean emit(BakedModel model, BlockState state, RenderContext context) {
    if (!(context instanceof FabricModelCapture capture)) return false;
    capture.bakedModelConsumer().accept(model, state);
    return true;
  }

  /**
   * Indigo's Mesh.outputTo casts its target to the renderer's own emitter class. Copycats+ cuts the
   * copied block in a mesh, then outputs it to the context's emitter: inside a capture, copy each
   * quad into the capture's emitter instead.
   *
   * @return true when the target was the capture's emitter
   */
  public static boolean output(Mesh mesh, QuadEmitter target) {
    if (!(target instanceof CaptureQuadEmitter capture)) return false;
    mesh.forEach(quad -> capture.copyFrom(quad).emit());
    return true;
  }
}
