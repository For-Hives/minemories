package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class GlbLimitsTest {
  private static final int[] AT_MAXIMUM = {
    GlbLimits.IMAGES,
    GlbLimits.TEXTURES,
    GlbLimits.ENTRIES,
    GlbLimits.PRIMITIVES,
    GlbLimits.NODES,
    GlbLimits.ENTRIES,
    GlbLimits.ENTRIES
  };
  private static final String[] NAMES = {
    "images", "textures", "materials", "primitives", "nodes", "accessors", "buffer-views"
  };

  private static void check(long json, int[] counts) throws GlbLimitException {
    GlbLimits.check(
        json, counts[0], counts[1], counts[2], counts[3], counts[4], counts[5], counts[6]);
  }

  @Test
  void aGlbAtEveryLimitIsAcceptedAndOneOverAnyIsRefusedByName() throws Exception {
    check(GlbLimits.JSON_BYTES, AT_MAXIMUM);
    var json =
        assertThrows(GlbLimitException.class, () -> check(GlbLimits.JSON_BYTES + 1L, AT_MAXIMUM));
    assertEquals("json-bytes", json.limit());
    assertEquals(GlbLimits.JSON_BYTES + 1L, json.value());
    assertEquals(GlbLimits.JSON_BYTES, json.maximum());
    for (int i = 0; i < AT_MAXIMUM.length; i++) {
      int[] counts = AT_MAXIMUM.clone();
      counts[i]++;
      var refused = assertThrows(GlbLimitException.class, () -> check(0, counts));
      assertEquals(NAMES[i], refused.limit());
      assertEquals(AT_MAXIMUM[i] + 1L, refused.value());
      assertTrue(refused.getMessage().contains(NAMES[i]));
    }
  }

  @Test
  void theValuesAreTheApiContractsOnes() {
    // packages/api-contract: MAX_GLB_JSON_BYTES, MAX_GLB_IMAGES, MAX_GLB_TEXTURES,
    // MAX_GLB_PRIMITIVES,
    // MAX_GLB_NODES, MAX_GLB_ENTRIES (a scripts/mod test reads both sides).
    assertEquals(4 * 1024 * 1024, GlbLimits.JSON_BYTES);
    assertEquals(4096, GlbLimits.IMAGES);
    assertEquals(4096, GlbLimits.TEXTURES);
    assertEquals(4096, GlbLimits.PRIMITIVES);
    assertEquals(4096, GlbLimits.NODES);
    assertEquals(16_384, GlbLimits.ENTRIES);
  }
}
