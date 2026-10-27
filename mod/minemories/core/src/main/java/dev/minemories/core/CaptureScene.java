package dev.minemories.core;

import java.io.IOException;
import java.nio.file.Path;

/** Capture output sink: geometry and lights go in, one GLB or tile bundle comes out. */
public interface CaptureScene extends AutoCloseable {
  default void setOrigin(int x, int y, int z) throws IOException {}

  void setPlayerPosition(double x, double y, double z);

  void addQuad(
      String key,
      String materialName,
      String imageKey,
      byte[] png,
      int tint,
      int alphaMode,
      float emission,
      float opacity,
      float[] xyz,
      float[] uv)
      throws IOException;

  void addPointLight(float x, float y, float z, int color, int level) throws IOException;

  boolean hasGeometry();

  int materialCount();

  long quadCount();

  void write(Path output) throws IOException;

  @Override
  void close() throws IOException;
}
