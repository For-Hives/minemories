package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class SpriteAtlasTest {
  /** A square sprite whose every texel differs from its neighbours and from other seeds. */
  static byte[] sprite(int size, int seed) throws IOException {
    BufferedImage image = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
    for (int y = 0; y < size; y++)
      for (int x = 0; x < size; x++)
        image.setRGB(x, y, 0xFF000000 | (seed * 7919 + x * 131 + y * 17) & 0xFFFFFF);
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    ImageIO.write(image, "png", out);
    return out.toByteArray();
  }

  private static BufferedImage decode(byte[] png) throws IOException {
    return ImageIO.read(new ByteArrayInputStream(png));
  }

  private static float[] full() {
    return new float[] {0, 0, 1, 0, 1, 1, 0, 1};
  }

  private static SpriteAtlas.Route route(SpriteAtlas atlas, String image, byte[] png, float[] uv) {
    return atlas.route(
        image + "#ffffff", "minecraft:stone / " + image, image, png, 0xFFFFFF, 0, 0, 1, uv);
  }

  @Test
  void onlySquarePowerOfTwoSpritesFrom8To64AreSized() throws IOException {
    assertEquals(16, SpriteAtlas.spriteSize(sprite(16, 1)));
    assertEquals(8, SpriteAtlas.spriteSize(sprite(8, 1)));
    assertEquals(64, SpriteAtlas.spriteSize(sprite(64, 1)));
    assertEquals(0, SpriteAtlas.spriteSize(sprite(4, 1)));
    assertEquals(0, SpriteAtlas.spriteSize(sprite(128, 1)));
    assertEquals(0, SpriteAtlas.spriteSize(sprite(24, 1)));
    BufferedImage strip = new BufferedImage(16, 32, BufferedImage.TYPE_INT_ARGB);
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    ImageIO.write(strip, "png", out);
    assertEquals(0, SpriteAtlas.spriteSize(out.toByteArray()));
    assertEquals(0, SpriteAtlas.spriteSize(null));
    assertEquals(0, SpriteAtlas.spriteSize(new byte[40]));
    byte[] notHeader = sprite(16, 1).clone();
    notHeader[12] = 'X';
    assertEquals(0, SpriteAtlas.spriteSize(notHeader));
  }

  @Test
  void everyTexelSampledInThePageIsTheSpritesOwnBordersIncluded() throws IOException {
    SpriteAtlas atlas = new SpriteAtlas();
    byte[][] sprites = {sprite(16, 1), sprite(16, 2), sprite(32, 3)};
    float[][][] remapped = new float[sprites.length][][];
    for (int s = 0; s < sprites.length; s++) {
      int size = SpriteAtlas.spriteSize(sprites[s]);
      remapped[s] = new float[size * size][];
      for (int y = 0; y < size; y++)
        for (int x = 0; x < size; x++) {
          float u = (x + .5f) / size, v = (y + .5f) / size;
          float[] uv = {u, v, u, v, u, v, u, v};
          assertNotNull(route(atlas, "block/s" + s, sprites[s], uv));
          remapped[s][y * size + x] = uv;
        }
    }
    // 16 and 32 texel sprites take 32 and 64 texel slots: two pages.
    assertEquals(2, atlas.pageCount());
    BufferedImage[] pages = {
      decode(atlas.png(SpriteAtlas.PREFIX + 0)), decode(atlas.png(SpriteAtlas.PREFIX + 1))
    };
    for (BufferedImage page : pages) {
      assertEquals(SpriteAtlas.PAGE, page.getWidth());
      assertEquals(SpriteAtlas.PAGE, page.getHeight());
    }
    for (int s = 0; s < sprites.length; s++) {
      BufferedImage source = decode(sprites[s]);
      BufferedImage page = pages[s < 2 ? 0 : 1];
      int size = source.getWidth();
      for (int y = 0; y < size; y++)
        for (int x = 0; x < size; x++) {
          float[] uv = remapped[s][y * size + x];
          int px = (int) Math.floor(uv[0] * SpriteAtlas.PAGE),
              py = (int) Math.floor(uv[1] * SpriteAtlas.PAGE);
          assertEquals(
              source.getRGB(x, y), page.getRGB(px, py), "sprite " + s + " texel " + x + "," + y);
        }
      // Around the sprite, its texels repeat as the REPEAT sampler would wrap them.
      float[] corner = remapped[s][0];
      int left = (int) Math.floor(corner[0] * SpriteAtlas.PAGE),
          top = (int) Math.floor(corner[1] * SpriteAtlas.PAGE);
      assertEquals(source.getRGB(size - 1, 0), page.getRGB(left - 1, top));
      assertEquals(source.getRGB(0, size - 1), page.getRGB(left, top - 1));
      assertEquals(source.getRGB(size - 1, size - 1), page.getRGB(left - 1, top - 1));
      // The slot is aligned on twice the sprite's size, the sprite in its middle.
      assertEquals(size / 2, left % (size * 2));
      assertEquals(size / 2, top % (size * 2));
    }
  }

  @Test
  void quadsThatDifferOnlyByTheirSpriteShareOneMaterial() throws IOException {
    SpriteAtlas atlas = new SpriteAtlas();
    var stone = route(atlas, "block/stone", sprite(16, 1), full());
    var dirt = route(atlas, "block/dirt", sprite(16, 2), full());
    assertEquals(stone.key(), dirt.key());
    assertEquals(SpriteAtlas.PREFIX + 0, stone.imageKey());
    assertTrue(SpriteAtlas.isPage(stone.imageKey()));
    assertEquals(SpriteAtlas.PREFIX + 0, stone.name());
    // Tint, emission, alpha test and opacity stay material properties.
    var tinted =
        atlas.route("k", "leaves", "block/oak_leaves", sprite(16, 3), 0x48B518, 1, 0, 1, full());
    assertNotEquals(stone.key(), tinted.key());
    assertEquals(SpriteAtlas.PREFIX + "0 (cutout)", tinted.name());
    var glowing =
        atlas.route("k", "glow", "block/glowstone", sprite(16, 4), 0xFFFFFF, 0, 1, 1, full());
    assertNotEquals(stone.key(), glowing.key());
    // A sprite seen again keeps its slot.
    float[] again = full();
    route(atlas, "block/stone", sprite(16, 1), again);
    float[] first = full();
    route(atlas, "block/stone", sprite(16, 1), first);
    assertArrayEquals(again, first);
  }

  @Test
  void blendedWaterBeamCutAndTiledQuadsKeepTheirOwnImage() throws IOException {
    SpriteAtlas atlas = new SpriteAtlas();
    byte[] png = sprite(16, 1);
    assertNull(atlas.route("k", "glass", "block/glass", png, 0xFFFFFF, 2, 0, 1, full()));
    assertNull(atlas.route("k", "minecraft:water / x", "block/x", png, 0xFFFFFF, 0, 0, 1, full()));
    assertNull(
        atlas.route("k", "x", "minecraft:block/water_still", png, 0xFFFFFF, 1, 0, 1, full()));
    assertNull(
        atlas.route("k", "minecraft:beacon / beacon_beam", "b", png, 0xFFFFFF, 0, 1, 1, full()));
    assertNull(atlas.route("minemories:cut#x", "cut", "block/c", png, 0xFFFFFF, 0, 0, 1, full()));
    assertNull(atlas.route("k", "x", SpriteAtlas.PREFIX + 0, png, 0xFFFFFF, 0, 0, 1, full()));
    float[] tiled = {0, 0, 2, 0, 2, 1, 0, 1};
    assertNull(route(atlas, "block/tiled", png, tiled));
    assertArrayEquals(new float[] {0, 0, 2, 0, 2, 1, 0, 1}, tiled);
    assertNull(route(atlas, "skin", sprite(128, 1), full()));
    assertNull(route(atlas, "tiny", new byte[] {1, 2, 3}, full()));
    assertEquals(0, atlas.pageCount());
    // A hair outside the sprite still packs, clamped to its edge.
    float[] edge = {-0.00005f, 0, 1.00005f, 0, 1, 1, 0, 1};
    assertNotNull(route(atlas, "block/edge", png, edge));
    assertEquals(8f / SpriteAtlas.PAGE, edge[0]);
    assertEquals(24f / SpriteAtlas.PAGE, edge[2]);
  }

  @Test
  void aFullPageOpensTheNextOneAndTheResultIsDeterministic() throws IOException {
    SpriteAtlas first = new SpriteAtlas(), second = new SpriteAtlas();
    int perPage = (SpriteAtlas.PAGE / 32) * (SpriteAtlas.PAGE / 32);
    SpriteAtlas.Route last = null;
    for (int i = 0; i <= perPage; i++) {
      byte[] png = sprite(16, i);
      last = route(first, "block/" + i, png, full());
      route(second, "block/" + i, png, full());
    }
    assertEquals(2, first.pageCount());
    assertEquals(SpriteAtlas.PREFIX + 1, last.imageKey());
    assertArrayEquals(first.png(SpriteAtlas.PREFIX + 1), second.png(SpriteAtlas.PREFIX + 1));
  }

  @Test
  void anUnreadableSpriteFailsThePageLoudly() throws IOException {
    SpriteAtlas atlas = new SpriteAtlas();
    byte[] png = sprite(16, 1);
    byte[] broken = java.util.Arrays.copyOf(png, 40);
    assertNotNull(route(atlas, "block/broken", broken, full()));
    assertThrows(IOException.class, () -> atlas.png(SpriteAtlas.PREFIX + 0));
  }
}
