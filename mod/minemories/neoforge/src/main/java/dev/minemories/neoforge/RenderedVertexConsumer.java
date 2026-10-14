package dev.minemories.neoforge;

import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.blaze3d.vertex.VertexFormat;
import java.util.function.Consumer;

/** Minecraft applies its pose matrices before forwarding positions to this bounded collector. */
final class RenderedVertexConsumer implements VertexConsumer {
  private final RenderedVertices vertices;

  RenderedVertexConsumer(VertexFormat.Mode mode, Consumer<RenderedVertices.Vertex[]> sink) {
    vertices =
        new RenderedVertices(
            switch (mode) {
              case QUADS -> RenderedVertices.Mode.QUADS;
              case TRIANGLES -> RenderedVertices.Mode.TRIANGLES;
              case TRIANGLE_STRIP -> RenderedVertices.Mode.TRIANGLE_STRIP;
              case TRIANGLE_FAN -> RenderedVertices.Mode.TRIANGLE_FAN;
              default -> throw new IllegalArgumentException("Unsupported captured primitive mode");
            },
            sink);
  }

  @Override
  public VertexConsumer addVertex(float x, float y, float z) {
    vertices.addVertex(x, y, z);
    return this;
  }

  @Override
  public VertexConsumer setColor(int red, int green, int blue, int alpha) {
    vertices.setColor(red, green, blue, alpha);
    return this;
  }

  @Override
  public VertexConsumer setUv(float u, float v) {
    vertices.setUv(u, v);
    return this;
  }

  @Override
  public VertexConsumer setUv1(int u, int v) {
    return this;
  }

  @Override
  public VertexConsumer setUv2(int u, int v) {
    return this;
  }

  @Override
  public VertexConsumer setNormal(float x, float y, float z) {
    return this;
  }

  void finish() {
    vertices.finish();
  }
}
