package dev.minemories.core;

import java.util.Arrays;

/**
 * Triangle ranges per 16 × 16 chunk column of one primitive, relative to the chunk holding the
 * capture origin. Quads arrive chunk by chunk, so consecutive quads of a chunk extend one run. A
 * primitive whose quads carry no chunk, or that would exceed the scene budget, publishes no ranges
 * and readers fall back to sorting the triangles themselves.
 */
final class ChunkRuns {
  static final int NONE = Integer.MIN_VALUE;

  /** Shared by all primitives of a scene so the JSON stays far below its size limit. */
  static final class Budget {
    private int remaining = 40_000;

    boolean take() {
      if (remaining == 0) return false;
      remaining--;
      return true;
    }
  }

  private final Budget budget;
  private int[] data = new int[16];
  private int size;
  private boolean valid = true;

  ChunkRuns(Budget budget) {
    this.budget = budget;
  }

  void record(int chunkX, int chunkZ, int trianglesBefore, int trianglesAfter) {
    if (!valid || trianglesAfter == trianglesBefore) return;
    if (chunkX == NONE || chunkZ == NONE) {
      invalidate();
      return;
    }
    int last = size - 4;
    if (size > 0
        && data[last] == chunkX
        && data[last + 1] == chunkZ
        && data[last + 2] + data[last + 3] == trianglesBefore) {
      data[last + 3] += trianglesAfter - trianglesBefore;
      return;
    }
    if (!budget.take()) {
      invalidate();
      return;
    }
    if (size == data.length) data = Arrays.copyOf(data, size * 2);
    data[size++] = chunkX;
    data[size++] = chunkZ;
    data[size++] = trianglesBefore;
    data[size++] = trianglesAfter - trianglesBefore;
  }

  private void invalidate() {
    valid = false;
    size = 0;
    data = new int[0];
  }

  /** JSON array {@code [x, z, firstTriangle, triangleCount, ...]}, or null when unavailable. */
  String json() {
    if (!valid || size == 0) return null;
    StringBuilder text = new StringBuilder("[");
    for (int index = 0; index < size; index++) {
      if (index > 0) text.append(',');
      text.append(data[index]);
    }
    return text.append(']').toString();
  }
}
