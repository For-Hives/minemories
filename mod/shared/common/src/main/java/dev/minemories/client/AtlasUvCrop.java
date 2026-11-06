package dev.minemories.client;

import java.io.IOException;

/** Preserve atlas sampling when a model's UVs cross a sprite edge (for example Create goggles). */
record AtlasUvCrop(int x, int y, int width, int height, int atlasWidth, int atlasHeight) {
  static AtlasUvCrop of(float[] uv, int atlasWidth, int atlasHeight) throws IOException {
    if (uv.length != 8 || atlasWidth < 1 || atlasHeight < 1)
      throw new IllegalArgumentException("Expected four UV pairs and valid atlas dimensions");
    float minU = 1, minV = 1, maxU = 0, maxV = 0;
    for (int i = 0; i < uv.length; i += 2) {
      if (!(Float.isFinite(uv[i]) && Float.isFinite(uv[i + 1]))) return null;
      minU = Math.min(minU, uv[i]);
      maxU = Math.max(maxU, uv[i]);
      minV = Math.min(minV, uv[i + 1]);
      maxV = Math.max(maxV, uv[i + 1]);
    }
    if (minU < 0 || minV < 0 || maxU > 1 || maxV > 1)
      throw new IOException("UV du renderer hors de l’atlas.");
    // Include neighbouring texels so filtering at the used UV boundary still samples the atlas.
    int x = (int) Math.max(0L, (long) Math.floor((double) minU * atlasWidth) - 1);
    int y = (int) Math.max(0L, (long) Math.floor((double) minV * atlasHeight) - 1);
    int endX = (int) Math.min(atlasWidth, (long) Math.ceil((double) maxU * atlasWidth) + 1);
    int endY = (int) Math.min(atlasHeight, (long) Math.ceil((double) maxV * atlasHeight) + 1);
    return new AtlasUvCrop(x, y, endX - x, endY - y, atlasWidth, atlasHeight);
  }

  String suffix() {
    return "crop/" + x + "_" + y + "_" + width + "_" + height;
  }

  void remap(float[] uv) {
    for (int i = 0; i < uv.length; i += 2) {
      uv[i] = Math.clamp((uv[i] * atlasWidth - x) / width, 0f, 1f);
      uv[i + 1] = Math.clamp((uv[i + 1] * atlasHeight - y) / height, 0f, 1f);
    }
  }
}
