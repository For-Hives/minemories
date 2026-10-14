package dev.minemories.neoforge;

import java.util.Objects;
import java.util.function.Consumer;

/** A renderer can emit arbitrarily many vertices; retain only one primitive at a time. */
final class RenderedVertices {
  enum Mode {
    QUADS,
    TRIANGLES,
    TRIANGLE_STRIP,
    TRIANGLE_FAN
  }

  record Vertex(
      float x, float y, float z, float u, float v, int red, int green, int blue, int alpha) {}

  private final Mode mode;
  private final Consumer<Vertex[]> sink;
  private final Vertex[] pending = new Vertex[4];
  private int count;
  private int triangles;
  private float x, y, z, u, v;
  private int red = 255, green = 255, blue = 255, alpha = 255;
  private boolean current;

  RenderedVertices(Mode mode, Consumer<Vertex[]> sink) {
    this.mode = Objects.requireNonNull(mode);
    this.sink = Objects.requireNonNull(sink);
  }

  RenderedVertices addVertex(float x, float y, float z) {
    flushVertex();
    this.x = x;
    this.y = y;
    this.z = z;
    u = 0;
    v = 0;
    red = 255;
    green = 255;
    blue = 255;
    alpha = 255;
    current = true;
    return this;
  }

  RenderedVertices setColor(int red, int green, int blue, int alpha) {
    this.red = channel(red);
    this.green = channel(green);
    this.blue = channel(blue);
    this.alpha = channel(alpha);
    return this;
  }

  RenderedVertices setUv(float u, float v) {
    this.u = u;
    this.v = v;
    return this;
  }

  void finish() {
    flushVertex();
    count = 0;
    triangles = 0;
    java.util.Arrays.fill(pending, null);
  }

  private void flushVertex() {
    if (!current) return;
    current = false;
    pending[count++] = new Vertex(x, y, z, u, v, red, green, blue, alpha);
    if (mode == Mode.QUADS && count == 4) {
      sink.accept(pending.clone());
      count = 0;
    } else if (count == 3 && mode != Mode.QUADS) {
      Vertex first = pending[0], second = pending[1], third = pending[2];
      if (mode == Mode.TRIANGLE_STRIP && (triangles++ & 1) != 0) {
        sink.accept(new Vertex[] {second, first, third, third});
      } else {
        sink.accept(new Vertex[] {first, second, third, third});
      }
      if (mode == Mode.TRIANGLE_STRIP) {
        pending[0] = second;
        pending[1] = third;
        count = 2;
      } else if (mode == Mode.TRIANGLE_FAN) {
        pending[1] = third;
        count = 2;
      } else {
        count = 0;
      }
    }
  }

  private static int channel(int value) {
    return Math.max(0, Math.min(255, value));
  }
}
