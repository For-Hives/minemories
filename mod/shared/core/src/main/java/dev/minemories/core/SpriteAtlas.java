package dev.minemories.core;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;

/**
 * Packs the small square sprites of a capture into shared 512 × 512 pages, so quads that only
 * differed by their texture share one material and one primitive. A real modded capture had about
 * 2,000 materials, each a primitive and a draw call; a very varied one passed the API's limits.
 *
 * <p>Each sprite of side S (8 to 64, a power of two) takes a 2S slot aligned on 2S, the sprite in
 * its middle and S/2 texels of it repeated around, wrapping as the GLB's REPEAT sampler does. The
 * viewer samples with mipmaps and anisotropic filtering: up to the mip level where one texel covers
 * the whole slot, every sample sees the same texels as the sprite's own image would, borders
 * included.
 *
 * <p>Only opaque and alpha-tested quads are packed, whose UVs stay inside their sprite: blended
 * materials keep their own image (the viewer inspects a blended texture as a whole), and so do
 * water, beacon beams and cut faces, which the viewer or the writer recognise by name or key.
 */
final class SpriteAtlas {
  static final int PAGE = 512;
  static final String PREFIX = "minemories:atlas/";
  private static final int MIN_SPRITE = 8;
  private static final int MAX_SPRITE = 64;
  private static final float UV_TOLERANCE = 0.0001f;
  private static final long PNG_SIGNATURE = 0x89504e470d0a1a0aL;

  /** Names the viewer reads (viewer-water.ts, viewer-framing.ts). */
  private static final Pattern SPECIAL_NAME =
      Pattern.compile("minecraft:water\\b|block/water_(?:still|flow)|beacon_beam");

  /** Where a packed quad goes instead: its material key, page image and material name. */
  record Route(String key, String imageKey, String name) {}

  private record Slot(int page, int x, int y, int size) {}

  private static final class Page {
    final int slot;
    final List<String> sprites = new ArrayList<>();

    Page(int slot) {
      this.slot = slot;
    }

    int capacity() {
      return (PAGE / slot) * (PAGE / slot);
    }
  }

  private final Map<String, Slot> slots = new HashMap<>();
  private final Map<String, byte[]> pngs = new HashMap<>();

  /** Sprite sizes already read; 0 when the sprite cannot be packed. */
  private final Map<String, Integer> sizes = new HashMap<>();

  private final List<Page> pages = new ArrayList<>();
  private final Map<Integer, Integer> openPage = new LinkedHashMap<>();

  /**
   * Packs the quad when it can be: its UVs move into the page in place and the returned route
   * replaces its key, image and material name. Null when it keeps its own image.
   */
  Route route(
      String key,
      String materialName,
      String imageKey,
      byte[] png,
      int tint,
      int alphaMode,
      float emission,
      float opacity,
      float[] uv) {
    if (alphaMode == 2 || imageKey.startsWith(PREFIX) || key.startsWith("minemories:cut"))
      return null;
    if (SPECIAL_NAME.matcher(materialName).find() || SPECIAL_NAME.matcher(imageKey).find())
      return null;
    for (float value : uv) if (!(value >= -UV_TOLERANCE && value <= 1 + UV_TOLERANCE)) return null;
    int size = sizes.computeIfAbsent(imageKey, ignored -> spriteSize(png));
    if (size == 0) return null;
    Slot slot = slots.computeIfAbsent(imageKey, ignored -> place(imageKey, png, size));
    int inset = slot.size / 4;
    int sprite = slot.size / 2;
    for (int index = 0; index < uv.length; index += 2) {
      float u = Math.min(1, Math.max(0, uv[index])), v = Math.min(1, Math.max(0, uv[index + 1]));
      uv[index] = (slot.x + inset + u * sprite) / PAGE;
      uv[index + 1] = (slot.y + inset + v * sprite) / PAGE;
    }
    String page = PREFIX + slot.page;
    return new Route(
        page
            + "#"
            + String.format("%06x", tint & 0xFFFFFF)
            + "#"
            + emission
            + "#"
            + alphaMode
            + "#"
            + opacity,
        page,
        page + (alphaMode == 1 ? " (cutout)" : ""));
  }

  /** Whether an image key is one of this capture's pages. */
  static boolean isPage(String imageKey) {
    return imageKey.startsWith(PREFIX);
  }

  /** The page's PNG, built from the sprites placed on it. */
  byte[] png(String imageKey) throws IOException {
    int index = Integer.parseInt(imageKey.substring(PREFIX.length()));
    Page page = pages.get(index);
    BufferedImage target = new BufferedImage(PAGE, PAGE, BufferedImage.TYPE_INT_ARGB);
    for (String sprite : page.sprites) {
      Slot slot = slots.get(sprite);
      BufferedImage source = ImageIO.read(new ByteArrayInputStream(pngs.get(sprite)));
      if (source == null) throw new IOException("Unreadable sprite " + sprite);
      int side = slot.size / 2, inset = slot.size / 4;
      for (int y = 0; y < slot.size; y++)
        for (int x = 0; x < slot.size; x++)
          target.setRGB(
              slot.x + x,
              slot.y + y,
              source.getRGB(
                  Math.floorMod(x - inset, side) * source.getWidth() / side,
                  Math.floorMod(y - inset, side) * source.getHeight() / side));
    }
    ByteArrayOutputStream encoded = new ByteArrayOutputStream();
    if (!ImageIO.write(target, "png", encoded)) throw new IOException("PNG encoder unavailable");
    return encoded.toByteArray();
  }

  /** Whether a packed sprite already holds other bytes under this image key. */
  boolean conflicts(String imageKey, byte[] png) {
    byte[] packed = pngs.get(imageKey);
    return packed != null && packed != png && !Arrays.equals(packed, png);
  }

  /** Pages used so far. */
  int pageCount() {
    return pages.size();
  }

  private Slot place(String imageKey, byte[] png, int size) {
    int slot = size * 2;
    Integer open = openPage.get(slot);
    if (open == null || pages.get(open).sprites.size() == pages.get(open).capacity()) {
      open = pages.size();
      pages.add(new Page(slot));
      openPage.put(slot, open);
    }
    Page page = pages.get(open);
    int n = page.sprites.size(), perRow = PAGE / slot;
    page.sprites.add(imageKey);
    pngs.put(imageKey, png);
    return new Slot(open, (n % perRow) * slot, (n / perRow) * slot, slot);
  }

  /** The side of a square, power-of-two sprite between 8 and 64 texels; 0 for anything else. */
  static int spriteSize(byte[] png) {
    if (png == null || png.length < 33) return 0;
    ByteBuffer header = ByteBuffer.wrap(png).order(ByteOrder.BIG_ENDIAN);
    if (header.getLong() != PNG_SIGNATURE || header.getInt() != 13 || header.getInt() != 0x49484452)
      return 0;
    int width = header.getInt(), height = header.getInt();
    boolean square = width == height && Integer.bitCount(width) == 1;
    return square && width >= MIN_SPRITE && width <= MAX_SPRITE ? width : 0;
  }
}
