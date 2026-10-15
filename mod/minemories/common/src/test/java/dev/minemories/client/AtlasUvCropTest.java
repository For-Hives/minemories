package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import org.junit.jupiter.api.Test;

class AtlasUvCropTest {
  @Test
  void preservesAtlasTexelsForCreateGogglesUvExtendingPastTheGlassSprite() throws Exception {
    int atlasWidth = 8192, atlasHeight = 4096;
    // Create's goggles glass up/down faces use [11, 0, 17, .2] in a 16-pixel sprite.
    float[] original = {
      (2048f + 11) / atlasWidth, 1024f / atlasHeight,
      (2048f + 17) / atlasWidth, 1024f / atlasHeight,
      (2048f + 17) / atlasWidth, 1024.2f / atlasHeight,
      (2048f + 11) / atlasWidth, 1024.2f / atlasHeight
    };
    var index =
        new AtlasUvIndex<>(
            java.util.List.of(
                new AtlasUvIndex.Region<>(
                    2048f / atlasWidth,
                    1024f / atlasHeight,
                    2064f / atlasWidth,
                    1040f / atlasHeight,
                    "black_stained_glass")));
    assertThrows(AtlasUvIndex.NoMatchingSpriteException.class, () -> index.find(original));
    AtlasUvCrop crop = AtlasUvCrop.of(original, atlasWidth, atlasHeight);
    assertNotNull(crop);
    assertEquals(2058, crop.x());
    assertEquals(1023, crop.y());
    assertEquals(8, crop.width());
    assertEquals(3, crop.height());
    float[] remapped = original.clone();
    crop.remap(remapped);
    for (int i = 0; i < 8; i += 2) {
      assertEquals(original[i] * atlasWidth, crop.x() + remapped[i] * crop.width(), .0002f);
      assertEquals(
          original[i + 1] * atlasHeight, crop.y() + remapped[i + 1] * crop.height(), .0002f);
      assertTrue(remapped[i] >= 0 && remapped[i] <= 1);
      assertTrue(remapped[i + 1] >= 0 && remapped[i + 1] <= 1);
    }
    assertEquals(crop.suffix(), AtlasUvCrop.of(original, atlasWidth, atlasHeight).suffix());
  }

  @Test
  void handlesDegenerateUvsAndAtlasBordersWithoutEmptyOrOutOfBoundsCrops() throws Exception {
    for (float value : new float[] {0, 1}) {
      float[] uv = {value, value, value, value, value, value, value, value};
      var crop = AtlasUvCrop.of(uv, 8192, 8192);
      assertNotNull(crop);
      assertEquals(1, crop.width());
      assertEquals(1, crop.height());
      crop.remap(uv);
      assertArrayEquals(new float[] {value, value, value, value, value, value, value, value}, uv);
    }
    var full = AtlasUvCrop.of(new float[] {0, 0, 1, 0, 1, 1, 0, 1}, 8192, 4096);
    assertNotNull(full);
    assertThrows(
        IOException.class, () -> RenderedTexture.checkDimensions(full.width(), full.height()));
  }

  @Test
  void invalidUvsDoNotBypassAtlasAndTextureBudgets() {
    assertNull(
        assertDoesNotThrow(
            () -> AtlasUvCrop.of(new float[] {Float.NaN, 0, 0, 0, 0, 0, 0, 0}, 1, 1)));
    assertNull(
        assertDoesNotThrow(
            () ->
                AtlasUvCrop.of(new float[] {0, Float.POSITIVE_INFINITY, 0, 0, 0, 0, 0, 0}, 1, 1)));
    assertThrows(
        IOException.class, () -> AtlasUvCrop.of(new float[] {-.01f, 0, 0, 0, 0, 0, 0, 0}, 1, 1));
    assertThrows(
        IOException.class, () -> AtlasUvCrop.of(new float[] {0, 0, 2, 0, 0, 0, 0, 0}, 1, 1));
    assertThrows(IllegalArgumentException.class, () -> AtlasUvCrop.of(new float[4], 1, 1));
    assertThrows(IllegalArgumentException.class, () -> AtlasUvCrop.of(new float[8], 0, 1));
    assertThrows(IllegalArgumentException.class, () -> AtlasUvCrop.of(new float[8], 1, 0));
  }
}
