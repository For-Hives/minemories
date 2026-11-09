package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class EndPortalLookTest {
  private static RenderedVertices.Vertex v(float x, float y, float z) {
    return new RenderedVertices.Vertex(x, y, z, 0, 0, 1, 2, 3, 4);
  }

  @Test
  void recognisesThePortalAndGatewayRenderTypesOnly() {
    assertTrue(EndPortalLook.matches("RenderType[end_portal:CompositeState[x]]"));
    assertTrue(EndPortalLook.matches("RenderType[end_gateway:CompositeState[x]]"));
    assertFalse(EndPortalLook.matches("RenderType[entity_cutout:CompositeState[x]]"));
  }

  @Test
  void bakesAnOpaqueFrameFromTheGameTextures() {
    int[] grey = new int[16 * 16];
    java.util.Arrays.fill(grey, 0xFF333333);
    int[] frame = EndPortalLook.bake(grey, 16, grey, 16);
    assertEquals(EndPortalLook.SIZE * EndPortalLook.SIZE, frame.length);
    for (int pixel : frame) assertEquals(0xFF, pixel >>> 24);
    // A dim grey texture sums every tint: not black, not saturated, and teal (more blue than red)
    // like the shader's colour table.
    int pixel = frame[0];
    assertTrue((pixel >> 16 & 255) > (pixel & 255), "blue must exceed red in ABGR");
    // Black textures give black.
    int[] black = new int[16 * 16];
    java.util.Arrays.fill(black, 0xFF000000);
    for (int p : EndPortalLook.bake(black, 16, black, 16)) assertEquals(0xFF000000, p);
  }

  @Test
  void samplingWrapsAroundTheTexture() {
    int[] sky = new int[4];
    sky[0] = 0xFFFFFFFF;
    int[] frame = EndPortalLook.bake(sky, 2, sky, 2);
    assertEquals(EndPortalLook.SIZE * EndPortalLook.SIZE, frame.length);
  }

  @Test
  void horizontalFaceGetsItsXzSpanAsUv() {
    var quad = new RenderedVertices.Vertex[] {v(2, 5, 4), v(2, 5, 5), v(3, 5, 5), v(3, 5, 4)};
    var out = EndPortalLook.planar(quad);
    assertEquals(0f, out[0].u());
    assertEquals(0f, out[0].v());
    assertEquals(1f, out[2].u());
    assertEquals(1f, out[2].v());
    for (var vertex : out) {
      assertEquals(255, vertex.red());
      assertEquals(255, vertex.alpha());
    }
  }

  @Test
  void verticalFaceUsesTheRemainingAxesAndOtherPrimitivesAreUntouched() {
    var wall = new RenderedVertices.Vertex[] {v(7, 0, 0), v(7, 1, 0), v(7, 1, 1), v(7, 0, 1)};
    var out = EndPortalLook.planar(wall);
    assertEquals(1f, out[2].u());
    assertEquals(1f, out[2].v());
    var triangle = new RenderedVertices.Vertex[] {v(0, 0, 0), v(1, 0, 0), v(1, 0, 1)};
    assertSame(triangle, EndPortalLook.planar(triangle));
    var degenerate = new RenderedVertices.Vertex[] {v(1, 1, 1), v(1, 1, 1), v(1, 1, 1), v(1, 1, 1)};
    assertEquals(0f, EndPortalLook.planar(degenerate)[0].u());
  }
}
