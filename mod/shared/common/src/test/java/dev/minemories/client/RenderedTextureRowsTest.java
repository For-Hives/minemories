package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InterruptedIOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class RenderedTextureRowsTest {
  @Test
  void separatedBandsProduceTheSamePngAndDoNotRetainProducerArrays() throws Exception {
    int[] first = {0xff0000ff, 0x8000ff00}, last = {0xffff0000, 0x00ffffff};
    var rows = new RenderedTexture.Rows(2, 2);
    rows.append(0, first);
    first[0] = 0;
    rows.append(1, last);
    var result = rows.finish();
    var expected =
        RenderedTexture.fromRgba(2, 2, new int[] {0xff0000ff, 0x8000ff00, 0xffff0000, 0x00ffffff});
    assertArrayEquals(expected.png(), result.png());
    assertEquals(2, result.alphaMode());
    assertEquals(0xffff0000, ImageIO.read(new ByteArrayInputStream(result.png())).getRGB(0, 0));
    assertThrows(IOException.class, () -> rows.append(0, last));
    assertThrows(IOException.class, rows::finish);
  }

  @Test
  void missingRepeatedAndOutOfRangeBandsCannotCreateAnImage() throws Exception {
    var rows = new RenderedTexture.Rows(2, 2);
    assertThrows(IOException.class, rows::finish);
    assertThrows(IOException.class, () -> rows.append(1, new int[2]));
    assertThrows(IOException.class, () -> rows.append(0, new int[3]));
    assertThrows(IOException.class, () -> rows.append(0, new int[0]));
    rows.append(0, new int[2]);
    assertThrows(IOException.class, () -> rows.append(0, new int[2]));
    assertThrows(IOException.class, () -> rows.append(1, new int[4]));
    assertThrows(IOException.class, () -> new RenderedTexture.Rows(16385, 1));
  }

  @Test
  void cancellationStopsCopiedBandsAndDoesNotConsumeTheInterrupt() throws Exception {
    var rows = new RenderedTexture.Rows(1, 1);
    Thread.currentThread().interrupt();
    try {
      assertThrows(InterruptedIOException.class, () -> rows.append(0, new int[] {-1}));
      assertTrue(Thread.currentThread().isInterrupted());
    } finally {
      Thread.interrupted();
    }
  }
}
