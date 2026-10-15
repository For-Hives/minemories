package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Random;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class AtlasTextureTest {
  @TempDir Path directory;
  private static final String ATLAS = "rendered/minecraft:textures/atlas/blocks.png";
  private static final float[] UV = {.25f, .25f, .5f, .25f, .5f, .5f, .25f, .5f};

  private static byte[] png(BufferedImage image) throws IOException {
    var bytes = new ByteArrayOutputStream();
    assertTrue(ImageIO.write(image, "png", bytes));
    return bytes.toByteArray();
  }

  private static BufferedImage image() {
    var image = new BufferedImage(128, 128, BufferedImage.TYPE_INT_ARGB);
    var random = new Random(37);
    for (int y = 0; y < 128; y++)
      for (int x = 0; x < 128; x++) image.setRGB(x, y, random.nextInt());
    image.setRGB(40, 40, 0x00ff00ff);
    image.setRGB(41, 41, 0x80775533);
    return image;
  }

  @Test
  void preservesDimensionsAndEveryUsedRgbaTexelIncludingOnePixelGuard() throws IOException {
    var originalImage = image();
    byte[] original = png(originalImage);
    var usage = new AtlasTexture.Usage(ATLAS);
    usage.include(UV);
    byte[] optimized = usage.optimize(original);
    assertTrue(optimized.length < original.length / 2);
    var decoded = ImageIO.read(new ByteArrayInputStream(optimized));
    assertEquals(128, decoded.getWidth());
    assertEquals(128, decoded.getHeight());
    for (int y = 0; y < 128; y++)
      for (int x = 0; x < 128; x++) {
        int expected = x >= 31 && x < 66 && y >= 31 && y < 66 ? originalImage.getRGB(x, y) : 0;
        assertEquals(expected, decoded.getRGB(x, y), "pixel " + x + "," + y);
      }
    assertArrayEquals(new float[] {.25f, .25f, .5f, .25f, .5f, .5f, .25f, .5f}, UV);
  }

  @Test
  void aggregatesEveryMaterialUseAndLeavesRepeatedOrOrdinaryTexturesAlone() throws IOException {
    byte[] original = png(image());
    var usage = new AtlasTexture.Usage(ATLAS);
    usage.include(UV);
    usage.include(new float[] {.6f, .6f, .65f, .6f, .65f, .65f, .6f, .65f});
    var decoded = ImageIO.read(new ByteArrayInputStream(usage.optimize(original)));
    assertEquals(image().getRGB(82, 82), decoded.getRGB(82, 82));
    for (float bad : new float[] {-1, 1, Float.NaN, Float.POSITIVE_INFINITY}) {
      var repeated = new AtlasTexture.Usage(ATLAS);
      repeated.include(new float[] {bad, .5f});
      repeated.include(UV);
      assertSame(original, repeated.optimize(original));
      var repeatedV = new AtlasTexture.Usage(ATLAS);
      repeatedV.include(new float[] {.5f, bad});
      assertSame(original, repeatedV.optimize(original));
    }
    var ordinary = new AtlasTexture.Usage("minecraft:block/stone");
    ordinary.include(UV);
    assertSame(original, ordinary.optimize(original));
    assertSame(original, new AtlasTexture.Usage(ATLAS).optimize(original));
    usage.include(new float[] {0, 0, .999f, .999f});
    assertSame(original, usage.optimize(original));
  }

  @Test
  void checksHeadersDimensionsAndBadStreamsBeforeDecodingAndNeverMakesAnImageLarger()
      throws IOException {
    var usage = new AtlasTexture.Usage(ATLAS);
    usage.include(UV);
    for (byte[] invalid :
        new byte[][] {new byte[0], new byte[33], new byte[AtlasTexture.MAX_BYTES + 1]}) {
      assertSame(invalid, usage.optimize(invalid));
    }
    byte[] original = png(image());
    for (int[] size :
        new int[][] {
          {0, 128}, {128, 0}, {63, 128}, {128, 63}, {16385, 128}, {128, 16385}, {4096, 4096}
        }) {
      byte[] invalid = original.clone();
      ByteBuffer.wrap(invalid).putInt(16, size[0]).putInt(20, size[1]);
      assertSame(invalid, usage.optimize(invalid));
    }
    for (int offset : new int[] {8, 12, 24, 40}) {
      byte[] invalid = original.clone();
      invalid[offset] ^= 127;
      assertSame(invalid, usage.optimize(invalid));
    }
    byte[] zero = png(new BufferedImage(128, 128, BufferedImage.TYPE_INT_ARGB));
    assertSame(zero, usage.optimize(zero));
  }

  @Test
  void respectsCaptureCancellation() throws IOException {
    byte[] original = png(image());
    var usage = new AtlasTexture.Usage(ATLAS);
    usage.include(UV);
    Thread.currentThread().interrupt();
    try {
      assertThrows(InterruptedIOException.class, () -> usage.optimize(original));
    } finally {
      Thread.interrupted();
    }
  }

  @Test
  void bothWritersAggregateAtlasUsesAndEmitTheSameSelfContainedFile() throws IOException {
    byte[] texture = png(image());
    GlbScene memory = new GlbScene();
    Path first = directory.resolve("memory.glb"), second = directory.resolve("spool.glb");
    try (var spool = new SpoolingGlbScene(directory)) {
      for (int material = 0; material < 2; material++) {
        float[] uv = material == 0 ? UV : new float[] {.6f, .6f, .65f, .6f, .65f, .65f, .6f, .65f};
        String key = "part-" + material;
        memory.addQuad(
            key, key, ATLAS, texture, 0x77abff, 2, .75f, .5f, SpoolingGlbSceneTest.XYZ, uv);
        spool.addQuad(
            key, key, ATLAS, texture, 0x77abff, 2, .75f, .5f, SpoolingGlbSceneTest.XYZ, uv);
      }
      memory.addPointLight(1, 2, 3, 0xffaa77, 15);
      spool.addPointLight(1, 2, 3, 0xffaa77, 15);
      memory.write(first);
      spool.write(second);
      byte[] bytes = Files.readAllBytes(first);
      assertArrayEquals(bytes, Files.readAllBytes(second));
      assertTrue(bytes.length < texture.length / 2);
      assertEquals(1, spool.metrics().textures());
      int jsonBytes = ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN).getInt(12);
      String json = new String(bytes, 20, jsonBytes, java.nio.charset.StandardCharsets.UTF_8);
      assertTrue(json.contains("\"alphaMode\":\"BLEND\""));
      assertTrue(json.contains("emissiveTexture"));
      assertTrue(json.contains("KHR_lights_punctual"));
      // The first position/normal/UV payload is unchanged; masking only replaces the PNG resource.
      ByteBuffer binary = ByteBuffer.wrap(bytes).order(java.nio.ByteOrder.LITTLE_ENDIAN);
      int offset = 28 + jsonBytes + 96;
      for (int i = 0; i < UV.length; i++)
        assertEquals(Float.floatToIntBits(UV[i]), binary.getInt(offset + i * 4));
    }
  }
}
