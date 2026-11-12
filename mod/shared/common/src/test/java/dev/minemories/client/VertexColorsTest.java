package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class VertexColorsTest {
  @Test
  void composesRendererColorWithBiomeTintWithoutConfusingRedAndBlue() {
    assertEquals(0x804020, VertexColors.multiplyTint(0x804020, 0xFFFFFFFF));
    assertEquals(0x404008, VertexColors.multiplyTint(0x804020, 0x8080FF40));
    assertEquals(0, VertexColors.multiplyTint(0xFFFFFF, 0xFF000000));
  }

  @Test
  void keepsTheRgbOfOpaqueArgbBlockTints() {
    assertEquals(0x619961, VertexColors.blockTint(0xFF619961));
    assertEquals(0x208030, VertexColors.blockTint(-14647248));
    assertEquals(0xFFFFFF, VertexColors.blockTint(-1));
    assertEquals(0x91BD59, VertexColors.blockTint(0x91BD59));
    assertEquals(
        0x619961, VertexColors.multiplyTint(VertexColors.blockTint(0xFF619961), 0xFFFFFFFF));
  }

  @Test
  void averagesAlphaIndependentlyAndKeepsUniformColorsExact() {
    assertEquals(0x9F7F6F67, VertexColors.averageArgb(0, 0xFFFFFFFF, 0xFF804020, 0x80808080));
    assertEquals(
        0x80FF0040, VertexColors.averageArgb(0x80FF0040, 0x80FF0040, 0x80FF0040, 0x80FF0040));
    assertEquals(0xFFFFFFFF, VertexColors.averageArgb(-1, -1, -1, -1));
  }

  @Test
  void readsTheColourBakedIntoVertexData() {
    int stride = 8;
    int[] vanilla = new int[4 * stride];
    for (int v = 0; v < 4; v++) vanilla[v * stride + 3] = -1;
    assertEquals(0xFFFFFFFF, VertexColors.quadColor(0xFFFFFFFF, vanilla, stride));
    // ABGR 0xFF40C080 is RGB 80C040: a model that bakes its green into the vertices.
    int[] green = new int[4 * stride];
    for (int v = 0; v < 4; v++) green[v * stride + 3] = 0xFF40C080;
    assertEquals(0xFF80C040, VertexColors.quadColor(0xFFFFFFFF, green, stride));
    assertEquals(
        0x80C040, VertexColors.multiplyTint(0xFFFFFF, VertexColors.quadColor(-1, green, stride)));
    // Layouts without a stored colour (alpha byte 0) are white, not black.
    assertEquals(0xFFFFFFFF, VertexColors.quadColor(0xFFFFFFFF, new int[4 * stride], stride));
    // A colour the platform already read wins; no vertices means nothing to read.
    assertEquals(0x80123456, VertexColors.quadColor(0x80123456, green, stride));
    assertEquals(0xFFFFFFFF, VertexColors.quadColor(0xFFFFFFFF, new int[0], stride));
  }
}
