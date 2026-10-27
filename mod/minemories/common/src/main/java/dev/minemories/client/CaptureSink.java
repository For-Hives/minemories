package dev.minemories.client;

import dev.minemories.core.GlbScene;
import dev.minemories.core.TileBundle;
import dev.minemories.core.TileGrid;
import dev.minemories.core.TiledGlbScene;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Stream;

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

  /** Manual captures saved as a `.mmtiles` bundle, so they join the cumulative world timeline. */
  final class Tiled implements CaptureSink {
    private final TiledGlbScene scene;
    private final Set<String> materials = new HashSet<>();

    Tiled(int tileChunks, int originX, int originY, int originZ) {
      scene = new TiledGlbScene(new TileGrid(tileChunks), originX, originY, originZ);
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
      materials.add(key);
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
      return materials.size();
    }

    @Override
    public void write(Path output) throws IOException {
      Path parent = output.toAbsolutePath().getParent();
      if (parent == null) throw new IOException("The bundle output has no parent directory.");
      Files.createDirectories(parent);
      Path tiles = Files.createTempDirectory(parent, "mmtiles-work-");
      try {
        TileBundle.write(output, scene.write(tiles), tiles);
      } finally {
        try (Stream<Path> files = Files.walk(tiles)) {
          files
              .sorted(Comparator.reverseOrder())
              .forEach(
                  path -> {
                    try {
                      Files.deleteIfExists(path);
                    } catch (IOException cleanup) {
                      throw new UncheckedIOException(cleanup);
                    }
                  });
        }
      }
    }
  }
}
