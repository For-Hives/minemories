package dev.minemories.client;

/**
 * Limits for the textures, render passes and quads that entity and block-entity renderers add to a
 * capture. Reaching a limit drops the offending texture or pass and counts it: the terrain and the
 * other entities stay in the capture.
 */
final class RenderedBudget {
  static final int MAX_TEXTURES = 512;
  static final long MAX_TEXTURE_BYTES = 64L * 1024 * 1024;
  static final int MAX_PASSES = 128;
  static final long MAX_QUADS = 500_000;

  private final int maxTextures;
  private final long maxTextureBytes;
  private final int maxPasses;
  private final long maxQuads;
  private long textureBytes;
  private long quads;
  private int skippedTextures;
  private int skippedPasses;
  private long skippedQuads;

  RenderedBudget() {
    this(MAX_TEXTURES, MAX_TEXTURE_BYTES, MAX_PASSES, MAX_QUADS);
  }

  RenderedBudget(int maxTextures, long maxTextureBytes, int maxPasses, long maxQuads) {
    this.maxTextures = maxTextures;
    this.maxTextureBytes = maxTextureBytes;
    this.maxPasses = maxPasses;
    this.maxQuads = maxQuads;
  }

  /** Whether one more texture may be registered; counts a skip otherwise. */
  boolean admitTexture(int registered) {
    if (registered < maxTextures) return true;
    skippedTextures++;
    return false;
  }

  /** Reserves the encoded size of a texture; counts a skip when it does not fit. */
  boolean admitBytes(long length) {
    if (length > maxTextureBytes - textureBytes) {
      skippedTextures++;
      return false;
    }
    textureBytes += length;
    return true;
  }

  /** Whether a model may open one more render pass; counts a skip otherwise. */
  boolean admitPass(int open) {
    if (open < maxPasses) return true;
    skippedPasses++;
    return false;
  }

  boolean admitQuad() {
    if (quads < maxQuads) {
      quads++;
      return true;
    }
    skippedQuads++;
    return false;
  }

  int skippedTextures() {
    return skippedTextures;
  }

  int skippedPasses() {
    return skippedPasses;
  }

  long skippedQuads() {
    return skippedQuads;
  }

  boolean anySkipped() {
    return skippedTextures > 0 || skippedPasses > 0 || skippedQuads > 0;
  }

  /** Counts only: no identifier, name or path reaches the log. */
  String summary() {
    return "skippedTextures="
        + skippedTextures
        + ", skippedPasses="
        + skippedPasses
        + ", skippedQuads="
        + skippedQuads;
  }
}
