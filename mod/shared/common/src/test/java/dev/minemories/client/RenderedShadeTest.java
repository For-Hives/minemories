package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class RenderedShadeTest {
  // Minecraft winding: the cross product of the first two edges points out of the face.
  private static final float[] UP = {0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0};
  private static final float[] DOWN = {0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1};
  private static final float[] NORTH = {0, 0, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0};
  private static final float[] EAST = {1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1};
  private static final int WHITE = 0xFFFFFF;

  private static int grey(int value) {
    return (value << 16) | (value << 8) | value;
  }

  /** Create's transformColor: (int) (255 * diffuse), clamped. */
  private static int createShade(double diffuse) {
    return grey((int) (255 * (float) diffuse));
  }

  private static float[] rotateY(float[] quad, double degrees) {
    double cos = Math.cos(Math.toRadians(degrees)), sin = Math.sin(Math.toRadians(degrees));
    float[] rotated = quad.clone();
    for (int index = 0; index < 12; index += 3) {
      rotated[index] = (float) (quad[index] * cos + quad[index + 2] * sin);
      rotated[index + 2] = (float) (-quad[index] * sin + quad[index + 2] * cos);
    }
    return rotated;
  }

  @Test
  void axisShadesMatchMinecraftAndFlywheel() {
    assertEquals(.5, RenderedShade.shade(0, -1, 0, false), 1e-6);
    assertEquals(1, RenderedShade.shade(0, 1, 0, false), 1e-6);
    assertEquals(.6, RenderedShade.shade(1, 0, 0, false), 1e-6);
    assertEquals(.8, RenderedShade.shade(0, 0, -1, false), 1e-6);
    assertEquals(.9, RenderedShade.shade(0, -1, 0, true), 1e-6);
    assertEquals(.9, RenderedShade.shade(0, 1, 0, true), 1e-6);
    assertEquals(.6, RenderedShade.shade(-1, 0, 0, true), 1e-6);
  }

  @Test
  void removesTheBakedDirectionalShadeOfEachFace() {
    // The greys measured on Create parts in the Lalaland captures: 127, 153, 204.
    assertEquals(WHITE, RenderedShade.unshade(grey(127), DOWN, false));
    assertEquals(WHITE, RenderedShade.unshade(grey(153), EAST, false));
    assertEquals(WHITE, RenderedShade.unshade(grey(152), EAST, false), "averaged corners");
    assertEquals(WHITE, RenderedShade.unshade(grey(204), NORTH, false));
    assertEquals(WHITE, RenderedShade.unshade(grey(203), NORTH, false));
    assertEquals(WHITE, RenderedShade.unshade(grey(229), DOWN, true), "Nether bottom face");
  }

  @Test
  void removesShadeOnRotatedPartsUsingTheWorldNormal() {
    // A blaze heater head turned 30 degrees: Flywheel shades the rotated normal, not the model one.
    float[] turned = rotateY(EAST, 30);
    int baked = createShade(.6 * .75 + .8 * .25);
    assertEquals(WHITE, RenderedShade.unshade(baked, turned, false));
    // The unrotated east shade on that turned face is not this face's shade: kept.
    assertEquals(grey(153), RenderedShade.unshade(grey(153), turned, false));
  }

  @Test
  void keepsRealTintsAndShadesOfOtherDirections() {
    int leaves = (72 << 16) | (181 << 8) | 24;
    assertEquals(leaves, RenderedShade.unshade(leaves, DOWN, false));
    int tinted = (127 << 16) | (100 << 8) | 127;
    assertEquals(tinted, RenderedShade.unshade(tinted, DOWN, false));
    assertEquals(
        grey(153), RenderedShade.unshade(grey(153), NORTH, false), "east shade, north face");
    assertEquals(grey(124), RenderedShade.unshade(grey(124), DOWN, false), "outside tolerance");
    assertEquals(
        grey(127), RenderedShade.unshade(grey(127), DOWN, true), "Overworld shade in the Nether");
    assertEquals(
        grey(200), RenderedShade.unshade(grey(200), UP, false), "the top face is never shaded");
    assertEquals(WHITE, RenderedShade.unshade(WHITE, EAST, false));
  }

  @Test
  void degenerateOrMalformedQuadsAreLeftAlone() {
    float[] flat = {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1};
    assertEquals(grey(127), RenderedShade.unshade(grey(127), flat, false));
    // A triangle stored as 0,1,2,2 still has a normal from its first triangle.
    float[] triangle = {0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1};
    assertEquals(WHITE, RenderedShade.unshade(grey(127), triangle, false));
    // Only the second triangle has area.
    float[] second = {0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1};
    assertEquals(WHITE, RenderedShade.unshade(grey(127), second, false));
    float[] infinite = {0, 0, 0, Float.POSITIVE_INFINITY, 0, 0, 0, 0, 0, 0, 0, 0};
    assertEquals(grey(127), RenderedShade.unshade(grey(127), infinite, false));
    assertThrows(
        IllegalArgumentException.class, () -> RenderedShade.unshade(0, new float[9], false));
  }
}
