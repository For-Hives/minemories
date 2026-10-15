package dev.minemories.client;

import dev.minemories.core.GlbScene;
import java.io.IOException;
import java.nio.file.Path;

/**
 * Geometry only: implementations must never require a world or renderer on their consumer thread.
 */
interface CaptureSink {
  void addQuad(
      String key,
      String name,
      String image,
      byte[] png,
      int tint,
      int alpha,
      float emission,
      float opacity,
      float[] xyz,
      float[] uv)
      throws IOException;

  default void addRenderedQuad(
      String key,
      String name,
      String image,
      byte[] png,
      int tint,
      int alpha,
      float emission,
      float opacity,
      float[] xyz,
      float[] uv,
      int layer)
      throws IOException {
    if (alpha != 0) RenderedLayer.separate(xyz, layer);
    addQuad(key, name, image, png, tint, alpha, emission, opacity, xyz, uv);
  }

  void addPointLight(float x, float y, float z, int color, int level) throws IOException;

  boolean hasGeometry();

  int materialCount();

  void write(Path output) throws IOException;

  /** The manual exporter retains its tested GLB serializer. */
  final class Legacy implements CaptureSink {
    private final GlbScene scene = new GlbScene();

    @Override
    public void addQuad(
        String key,
        String name,
        String image,
        byte[] png,
        int tint,
        int alpha,
        float emission,
        float opacity,
        float[] xyz,
        float[] uv) {
      scene.addQuad(key, name, image, png, tint, alpha, emission, opacity, xyz, uv);
    }

    @Override
    public void addPointLight(float x, float y, float z, int color, int level) {
      scene.addPointLight(x, y, z, color, level);
    }

    @Override
    public boolean hasGeometry() {
      return scene.hasGeometry();
    }

    @Override
    public int materialCount() {
      return scene.materialCount();
    }

    public void setPlayerPosition(double x, double y, double z) {
      scene.setPlayerPosition(x, y, z);
    }

    @Override
    public void write(Path output) throws IOException {
      scene.write(output);
    }
  }
}
