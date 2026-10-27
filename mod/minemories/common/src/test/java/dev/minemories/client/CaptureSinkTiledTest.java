package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class CaptureSinkTiledTest {

  @Test
  void writesATileBundleAndLeavesNoWorkDirectory(@TempDir Path directory) throws IOException {
    var sink = new CaptureSink.Tiled(4, 0, 64, 0);
    assertFalse(sink.hasGeometry());
    // Two quads in different 64-block tiles around the origin.
    sink.addQuad("grass", "grass", "grass", pngBytes(), -1, 0, 0f, 1f, quad(-70f), uv());
    sink.addQuad("grass", "grass", "grass", pngBytes(), -1, 0, 0f, 1f, quad(10f), uv());
    sink.addPointLight(1f, 1f, 1f, 0xFFFFFF, 12);
    assertTrue(sink.hasGeometry());
    assertEquals(1, sink.materialCount());
    Path output = directory.resolve("history/capture.glb");
    sink.write(output);
    byte[] bundle = Files.readAllBytes(output);
    assertEquals("MMTB", new String(bundle, 0, 4, StandardCharsets.US_ASCII));
    try (Stream<Path> files = Files.list(output.getParent())) {
      assertEquals(1, files.count());
    }
  }

  private static byte[] pngBytes() throws IOException {
    var image = new java.awt.image.BufferedImage(1, 1, java.awt.image.BufferedImage.TYPE_INT_ARGB);
    image.setRGB(0, 0, 0xFF00FF00);
    var out = new java.io.ByteArrayOutputStream();
    javax.imageio.ImageIO.write(image, "png", out);
    return out.toByteArray();
  }

  private static float[] quad(float x) {
    return new float[] {x, 0, 0, x + 1, 0, 0, x + 1, 1, 0, x, 1, 0};
  }

  private static float[] uv() {
    return new float[] {0, 0, 1, 0, 1, 1, 0, 1};
  }
}
