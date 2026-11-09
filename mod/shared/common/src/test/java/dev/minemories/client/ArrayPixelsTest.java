package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class ArrayPixelsTest {
  @Test
  void servesBandsAndKeepsItsOwnCopy() {
    int[] pixels = {1, 2, 3, 4, 5, 6};
    var source = new ArrayPixels("k", pixels, 2, 3);
    pixels[0] = 99;
    assertEquals("k", source.key());
    assertEquals(2, source.width());
    assertEquals(3, source.height());
    assertArrayEquals(new int[] {3, 4, 5, 6}, source.readBand(1, 2));
    assertArrayEquals(new int[] {1, 2}, source.readBand(0, 1));
  }

  @Test
  void rejectsInconsistentInput() {
    assertThrows(IllegalArgumentException.class, () -> new ArrayPixels("k", new int[3], 2, 2));
    var source = new ArrayPixels("k", new int[4], 2, 2);
    assertThrows(IllegalArgumentException.class, () -> source.readBand(1, 2));
    assertThrows(IllegalArgumentException.class, () -> source.readBand(-1, 1));
    assertThrows(IllegalArgumentException.class, () -> source.readBand(0, 0));
  }
}
