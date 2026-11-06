package dev.minemories.core;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.imageio.ImageIO;

/** Synthetic terrain, cutout, glass and emissive fixture for Blender import/render comparisons. */
public final class SpoolingGlbFixture {
  private SpoolingGlbFixture() {}

  public static void main(String[] args) throws IOException {
    Path folder = Path.of(args[0]).toAbsolutePath();
    Files.createDirectories(folder);
    byte[][] textures = new byte[4][];
    int[] colors = {0xffad8253, 0xff71cf50, 0xff9ec8ff, 0xffffca65};
    for (int image = 0; image < textures.length; image++) {
      BufferedImage pixels = new BufferedImage(2, 2, BufferedImage.TYPE_INT_ARGB);
      pixels.setRGB(0, 0, colors[image]);
      pixels.setRGB(0, 1, colors[image]);
      pixels.setRGB(1, 0, colors[image] & 0xffdddddd);
      pixels.setRGB(1, 1, image == 1 ? 0 : colors[image]);
      try (ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
        if (!ImageIO.write(pixels, "png", bytes)) throw new IOException("PNG writer unavailable");
        textures[image] = bytes.toByteArray();
      }
    }
    float[][] positions = {
      {-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1},
      {-1, 2, 1, 1, 2, 1, 1, 2, -1, -1, 2, -1},
      {-1, 0, 1, 1, 0, 1, 1, 2, 1, -1, 2, 1},
      {1, 0, -1, -1, 0, -1, -1, 2, -1, 1, 2, -1},
      {-1, 0, -1, -1, 0, 1, -1, 2, 1, -1, 2, -1},
      {1, 0, 1, 1, 0, -1, 1, 2, -1, 1, 2, 1},
      {-0.8f, 2, 1.3f, 0.8f, 2, 1.3f, 0.8f, 3, 1.3f, -0.8f, 3, 1.3f},
      {1.3f, 0, 1, 1.3f, 0, -1, 1.3f, 2, -1, 1.3f, 2, 1},
      {-0.25f, 2.4f, 1, 0.25f, 2.4f, 1, 0.25f, 2.9f, 1, -0.25f, 2.9f, 1}
    };
    float[] uv = {0, 0, 1, 0, 1, 1, 0, 1};
    String[] names = {"terrain", "leaves", "glass", "lamp"};
    GlbScene legacy = new GlbScene();
    try (SpoolingGlbScene scene = new SpoolingGlbScene(folder)) {
      for (int face = 0; face < positions.length; face++) {
        int material = face < 6 ? 0 : face - 5;
        int alpha = material == 1 ? 1 : material == 2 ? 2 : 0;
        float emission = material == 3 ? 1 : 0, opacity = material == 2 ? 0.4f : 1;
        legacy.addQuad(
            names[material],
            names[material],
            names[material],
            textures[material],
            0xffffff,
            alpha,
            emission,
            opacity,
            positions[face],
            uv);
        scene.addQuad(
            names[material],
            names[material],
            names[material],
            textures[material],
            0xffffff,
            alpha,
            emission,
            opacity,
            positions[face],
            uv);
      }
      legacy.addPointLight(0, 2.7f, 1.4f, 0xffca65, 8);
      scene.addPointLight(0, 2.7f, 1.4f, 0xffca65, 8);
      legacy.write(folder.resolve("fixture-legacy.glb"));
      scene.write(folder.resolve("fixture-spooled.glb"));
      System.out.println(scene.metrics());
    }
  }
}
