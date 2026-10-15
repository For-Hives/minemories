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
  void averagesAlphaIndependentlyAndKeepsUniformColorsExact() {
    assertEquals(0x9F7F6F67, VertexColors.averageArgb(0, 0xFFFFFFFF, 0xFF804020, 0x80808080));
    assertEquals(
        0x80FF0040, VertexColors.averageArgb(0x80FF0040, 0x80FF0040, 0x80FF0040, 0x80FF0040));
    assertEquals(0xFFFFFFFF, VertexColors.averageArgb(-1, -1, -1, -1));
  }
}
