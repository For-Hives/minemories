package dev.minemories.fabric;

import net.fabricmc.fabric.api.renderer.v1.mesh.Mesh;
import net.fabricmc.fabric.api.renderer.v1.mesh.QuadEmitter;

/** Lets a model output a mesh of its own to the capture's emitter. */
public final class MeshCapture {
  private MeshCapture() {}

  /**
   * Indigo's Mesh.outputTo casts its target to the renderer's own emitter class, so a model that
   * builds a mesh and outputs it to the context's emitter (Copycats+ copycats do on 1.20.1) failed
   * the whole capture. Inside a capture, copy each quad into the capture's emitter instead.
   *
   * @return true when the target was the capture's emitter
   */
  public static boolean output(Mesh mesh, QuadEmitter target) {
    if (!(target instanceof CaptureQuadEmitter capture)) return false;
    mesh.forEach(quad -> capture.copyFrom(quad).emit());
    return true;
  }
}
