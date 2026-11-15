package dev.minemories.core;

/**
 * The GLB limits the API and the viewer enforce (`packages/api-contract/src/glb*.ts`), checked
 * before a capture is written: a file over any of them is refused at upload (HTTP 400) and cannot
 * be opened online, so it is never written. A test in `scripts/mod` keeps these values equal to the
 * contract's.
 *
 * <p>A capture of a very varied area (thousands of different block textures) reaches them: about
 * 3,300 different materials fill the 16,384 buffer views first, each one taking a primitive, four
 * accessors, four or five views and about 1.2 KB of JSON.
 */
public final class GlbLimits {
  /** {@code MAX_GLB_JSON_BYTES}. */
  public static final int JSON_BYTES = 4 * 1024 * 1024;

  /** {@code MAX_GLB_IMAGES}. */
  public static final int IMAGES = 4096;

  /** {@code MAX_GLB_TEXTURES}. */
  public static final int TEXTURES = 4096;

  /** {@code MAX_GLB_PRIMITIVES}. */
  public static final int PRIMITIVES = 4096;

  /** {@code MAX_GLB_NODES}. */
  public static final int NODES = 4096;

  /**
   * {@code MAX_GLB_ENTRIES}: the most entries of any top-level array (materials, accessors, buffer
   * views).
   */
  public static final int ENTRIES = 16_384;

  private GlbLimits() {}

  /** Throws {@link GlbLimitException} naming the first limit the counted GLB is over, if any. */
  public static void check(
      long jsonBytes,
      int images,
      int textures,
      int materials,
      int primitives,
      int nodes,
      int accessors,
      int bufferViews)
      throws GlbLimitException {
    over("json-bytes", jsonBytes, JSON_BYTES);
    over("images", images, IMAGES);
    over("textures", textures, TEXTURES);
    over("materials", materials, ENTRIES);
    over("primitives", primitives, PRIMITIVES);
    over("nodes", nodes, NODES);
    over("accessors", accessors, ENTRIES);
    over("buffer-views", bufferViews, ENTRIES);
  }

  private static void over(String limit, long value, long maximum) throws GlbLimitException {
    if (value > maximum) throw new GlbLimitException(limit, value, maximum);
  }
}
