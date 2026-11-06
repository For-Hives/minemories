package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

final class AtlasRepackTest {
  private static byte[] png(BufferedImage image) throws IOException {
    var bytes = new ByteArrayOutputStream();
    assertTrue(ImageIO.write(image, "png", bytes));
    return bytes.toByteArray();
  }

  private static BufferedImage atlas(int size) {
    var image = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
    var random = new Random(11);
    for (int y = 0; y < size; y++)
      for (int x = 0; x < size; x++) image.setRGB(x, y, random.nextInt());
    return image;
  }

  private static UvBounds bounds(float u0, float v0, float u1, float v1) {
    var bounds = new UvBounds();
    bounds.include(u0, v0);
    bounds.include(u1, v1);
    return bounds;
  }

  @Test
  void everySampledTexelSurvivesAtItsRemappedCoordinate() throws IOException {
    var source = atlas(256);
    // Two separate sprites and a third overlapping the first: the overlap shares one copy.
    List<UvBounds> users =
        List.of(
            bounds(.10f, .10f, .15f, .15f),
            bounds(.70f, .30f, .75f, .36f),
            bounds(.13f, .12f, .20f, .18f));
    var plan = AtlasRepack.plan(png(source), 256, 256, users);
    assertNotNull(plan);
    var packed = ImageIO.read(new ByteArrayInputStream(plan.png()));
    assertTrue((long) packed.getWidth() * packed.getHeight() * 2 <= 256L * 256);
    for (int user = 0; user < users.size(); user++) {
      var area = users.get(user);
      // Texel centres: exact texel edges are ambiguous for NEAREST sampling in any case.
      for (int sy = (int) Math.floor(area.minV * 256);
          sy <= (int) Math.floor(area.maxV * 256);
          sy++) {
        for (int sx = (int) Math.floor(area.minU * 256);
            sx <= (int) Math.floor(area.maxU * 256);
            sx++) {
          double u = (sx + .5) / 256, v = (sy + .5) / 256;
          double mu = u * plan.scaleU() + plan.offsetU()[user],
              mv = v * plan.scaleV() + plan.offsetV()[user];
          int px = (int) Math.floor(mu * packed.getWidth()),
              py = (int) Math.floor(mv * packed.getHeight());
          assertEquals(
              source.getRGB(sx, sy), packed.getRGB(px, py), "user " + user + " " + sx + "," + sy);
        }
      }
    }
  }

  @Test
  void refusesRepacksThatAreUnsafeOrNotWorthIt() throws IOException {
    byte[] data = png(atlas(128));
    assertNull(AtlasRepack.plan(data, 128, 128, List.of()));
    assertNull(AtlasRepack.plan(data, 128, 128, List.of(new UvBounds())));
    assertNull(AtlasRepack.plan(data, 128, 128, List.of(bounds(0f, 0f, .9f, .9f))));
    List<UvBounds> many = new ArrayList<>();
    for (int index = 0; index <= AtlasRepack.MAX_RECTANGLES; index++)
      many.add(bounds(.1f, .1f, .2f, .2f));
    assertNull(AtlasRepack.plan(data, 128, 128, many));
    assertNull(AtlasRepack.plan(new byte[40], 128, 128, List.of(bounds(.1f, .1f, .2f, .2f))));
    assertNull(AtlasRepack.plan(data, 64, 64, List.of(bounds(.1f, .1f, .2f, .2f))));
  }

  @Test
  void respectsCaptureCancellation() throws IOException {
    byte[] data = png(atlas(128));
    Thread.currentThread().interrupt();
    try {
      assertThrows(
          InterruptedIOException.class,
          () -> AtlasRepack.plan(data, 128, 128, List.of(bounds(.1f, .1f, .2f, .2f))));
    } finally {
      Thread.interrupted();
    }
  }
}
