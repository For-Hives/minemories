package dev.minemories.core;

import java.util.Arrays;

/**
 * Bounded exact-vertex cache shared by both GLB writers. A vertex is reused only when position,
 * normal and UV are bit-identical inside the same primitive, so welding never changes a render. The
 * table is direct-mapped: a collision evicts the older entry, which costs a missed merge but never
 * correctness, and memory stays constant whatever the capture size.
 */
final class VertexCache {
  static final int SLOTS = 1 << 16;
  private static final int FIELDS = 8;

  private final int[] bits = new int[SLOTS * FIELDS];
  private final int[] part = new int[SLOTS];
  private final int[] vertex = new int[SLOTS];

  VertexCache() {
    Arrays.fill(vertex, -1);
  }

  /**
   * Returns the index of an identical vertex already emitted for this primitive, or {@code -1}
   * after remembering {@code next} as the index of the vertex the caller is about to append.
   */
  int intern(int primitive, float[] values, int next) {
    int hash = primitive * 0x9E3779B9;
    for (int index = 0; index < FIELDS; index++) {
      // Floats such as 1.0f only differ in their high bits: mix each word down before the next.
      hash = (hash ^ Float.floatToRawIntBits(values[index])) * 0x85EBCA6B;
      hash ^= hash >>> 15;
    }
    int slot = (hash ^ (hash >>> 16)) & (SLOTS - 1);
    int base = slot * FIELDS;
    if (vertex[slot] >= 0 && part[slot] == primitive && same(base, values)) return vertex[slot];
    for (int index = 0; index < FIELDS; index++) {
      bits[base + index] = Float.floatToRawIntBits(values[index]);
    }
    part[slot] = primitive;
    vertex[slot] = next;
    return -1;
  }

  private boolean same(int base, float[] values) {
    for (int index = 0; index < FIELDS; index++) {
      if (bits[base + index] != Float.floatToRawIntBits(values[index])) return false;
    }
    return true;
  }
}
