package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

final class RenderedTextureTest {
  @Test
  void embedsActualRgbaChannelsAndRetainsPixelOrder() throws IOException {
    var texture =
        RenderedTexture.fromRgba(2, 2, new int[] {0xff0000ff, 0xff00ff00, 0xffff0000, 0xffffffff});
    var image = ImageIO.read(new ByteArrayInputStream(texture.png()));
    assertEquals(0xffff0000, image.getRGB(0, 0));
    assertEquals(0xff00ff00, image.getRGB(1, 0));
    assertEquals(0xff0000ff, image.getRGB(0, 1));
    assertEquals(0xffffffff, image.getRGB(1, 1));
    assertEquals(0, texture.alphaMode());
    byte[] copy = texture.png();
    copy[0] = 0;
    assertEquals(0x89, texture.png()[0] & 255);
  }

  @Test
  void distinguishesCutoutAndTranslucentPixels() throws IOException {
    var cutout = RenderedTexture.fromRgba(2, 1, new int[] {0x00ffffff, 0xffffffff});
    assertEquals(1, cutout.alphaMode());
    var translucent = RenderedTexture.fromRgba(2, 1, new int[] {0x00ffffff, 0x80ffffff});
    assertEquals(2, translucent.alphaMode());
    assertEquals(
        0x80ffffff, ImageIO.read(new ByteArrayInputStream(translucent.png())).getRGB(1, 0));
  }

  @Test
  void checksDimensionsBeforeAllocatingTheImage() throws IOException {
    RenderedTexture.checkDimensions(2048, 2048);
    for (int[] size : new int[][] {{0, 1}, {1, 0}, {-1, 1}, {2049, 2048}, {Integer.MAX_VALUE, 2}}) {
      assertThrows(IOException.class, () -> RenderedTexture.checkDimensions(size[0], size[1]));
    }
    assertThrows(IllegalArgumentException.class, () -> RenderedTexture.fromRgba(2, 2, new int[3]));
  }
}
