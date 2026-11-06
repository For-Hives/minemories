package dev.minemories.client;

import dev.minemories.core.GlbCategory;
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

  /**
   * What the following quads come from and which chunk owns them, relative to the chunk holding the
   * capture origin. Stays in force until the next call.
   */
  default void classify(GlbCategory category, int chunkX, int chunkZ) {}

  /** Chunk of {@code block} relative to the chunk containing {@code origin}. */
  static int relativeChunk(int block, int origin) {
    return Math.floorDiv(block, 16) - Math.floorDiv(origin, 16);
  }

  boolean hasGeometry();

  int materialCount();

  void write(Path output) throws IOException;

  /** The manual exporter retains its tested GLB serializer. */
  final class Legacy implements CaptureSink {
    private final GlbScene scene = new GlbScene();
    private GlbCategory category = GlbCategory.TERRAIN;
    private int chunkX = dev.minemories.core.GlbScene.NO_CHUNK, chunkZ = GlbScene.NO_CHUNK;

    @Override
    public void classify(GlbCategory category, int chunkX, int chunkZ) {
      this.category = category;
      this.chunkX = chunkX;
      this.chunkZ = chunkZ;
    }

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
      scene.addQuad(
          category, chunkX, chunkZ, key, name, image, png, tint, alpha, emission, opacity, xyz, uv);
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

    public dev.minemories.core.ChunkStats chunkStats() {
      return scene.chunkStats();
    }

    public void setSource(String minecraft, String loader, String mod, String dimension) {
      scene.setSource(minecraft, loader, mod, dimension);
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
