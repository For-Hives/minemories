package dev.minemories.client;

import dev.minemories.core.GlbCategory;
import java.io.IOException;
import java.nio.file.Path;

/**
 * Captures a detached volume with the ordinary block, fluid, block entity and entity code: that
 * code writes relative to a local {@code origin} block of the volume's storage, and this sink moves
 * every primitive to where the volume is drawn, relative to the capture {@code center}. Everything
 * the volume holds belongs to the chunk it is drawn over.
 */
final class PlacedSink implements CaptureSink {
  private final CaptureSink target;
  private final Placement placement;
  private final int[] origin;
  private final int[] center;
  private final int chunkX, chunkZ;

  /** The origin is the lowest corner of {@code cells}; the chunk is where their middle is drawn. */
  PlacedSink(CaptureSink target, Placement placement, CaptureBounds cells, int[] center) {
    this.target = target;
    this.placement = placement;
    this.origin = new int[] {cells.minX(), cells.minY(), cells.minZ()};
    this.center = center.clone();
    double[] middle =
        placement.toWorld(
            (cells.minX() + (double) cells.maxX() + 1) / 2,
            (cells.minY() + (double) cells.maxY() + 1) / 2,
            (cells.minZ() + (double) cells.maxZ() + 1) / 2);
    this.chunkX = CaptureSink.relativeChunk((int) Math.floor(middle[0]), center[0]);
    this.chunkZ = CaptureSink.relativeChunk((int) Math.floor(middle[2]), center[2]);
  }

  int[] origin() {
    return origin.clone();
  }

  @Override
  public void classify(GlbCategory category, int ignoredX, int ignoredZ) {
    target.classify(category, chunkX, chunkZ);
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
      float[] uv)
      throws IOException {
    float[] placed = placement.toCapture(xyz, origin, center);
    target.addQuad(
        key, name, image, png, tint, alpha, emission, opacity, wound(placed, 3), wound(uv, 2));
  }

  @Override
  public void addRenderedQuad(
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
    float[] placed = placement.toCapture(xyz, origin, center);
    target.addRenderedQuad(
        key,
        name,
        image,
        png,
        tint,
        alpha,
        emission,
        opacity,
        wound(placed, 3),
        wound(uv, 2),
        layer);
  }

  @Override
  public void addPointLight(float x, float y, float z, int color, int level) throws IOException {
    float[] placed = placement.toCapture(new float[] {x, y, z}, origin, center);
    target.addPointLight(placed[0], placed[1], placed[2], color, level);
  }

  /** A mirroring placement reverses the vertex order so the face still points outwards. */
  private float[] wound(float[] values, int stride) {
    if (placement.keepsWinding()) return values;
    int count = values.length / stride;
    float[] reversed = new float[values.length];
    for (int vertex = 0; vertex < count; vertex++)
      System.arraycopy(values, vertex * stride, reversed, (count - 1 - vertex) * stride, stride);
    return reversed;
  }

  @Override
  public boolean hasGeometry() {
    return target.hasGeometry();
  }

  @Override
  public int materialCount() {
    return target.materialCount();
  }

  @Override
  public void write(Path output) {
    throw new IllegalStateException("A placed volume writes through its capture");
  }
}
