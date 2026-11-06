package dev.minemories.core;

/** UV rectangle of one primitive, used to repack the atlas texels it can sample. */
final class UvBounds {
  float minU = 1, minV = 1, maxU = 0, maxV = 0;

  void include(float u, float v) {
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }

  boolean empty() {
    return minU > maxU || minV > maxV;
  }
}
