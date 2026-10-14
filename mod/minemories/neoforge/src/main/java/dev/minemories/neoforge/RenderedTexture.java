package dev.minemories.neoforge;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;

/** Converts copied RGBA pixels to a bounded, self-contained texture without Minecraft objects. */
final class RenderedTexture {
  static final int MAX_PIXELS = 4 * 1024 * 1024;
  static final int MAX_PNG_BYTES = 16 * 1024 * 1024;
  private final byte[] png;
  private final int alphaMode;

  private RenderedTexture(byte[] png, int alphaMode) {
    this.png = png;
    this.alphaMode = alphaMode;
  }

  static void checkDimensions(int width, int height) throws IOException {
    if (width < 1 || height < 1 || (long) width * height > MAX_PIXELS)
      throw new IOException("La texture du modèle dépasse la limite de pixels.");
  }

  static RenderedTexture fromRgba(int width, int height, int[] rgba) throws IOException {
    checkDimensions(width, height);
    if (rgba.length != (long) width * height)
      throw new IllegalArgumentException("Invalid rendered texture pixel count");
    BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
    boolean transparent = false, translucent = false;
    for (int index = 0; index < rgba.length; index++) {
      int pixel = rgba[index], alpha = pixel >>> 24;
      transparent |= alpha == 0;
      translucent |= alpha != 0 && alpha != 255;
      int argb =
          (alpha << 24) | ((pixel & 255) << 16) | (pixel & 0x0000FF00) | ((pixel >>> 16) & 255);
      image.setRGB(index % width, index / width, argb);
    }
    BoundedPng bytes = new BoundedPng();
    if (!ImageIO.write(image, "png", bytes)) throw new IOException("PNG encoder unavailable");
    return new RenderedTexture(bytes.toByteArray(), translucent ? 2 : transparent ? 1 : 0);
  }

  int alphaMode() {
    return alphaMode;
  }

  byte[] png() {
    return png.clone();
  }

  private static final class BoundedPng extends ByteArrayOutputStream {
    @Override
    public synchronized void write(int value) {
      if (count == MAX_PNG_BYTES)
        throw new IllegalStateException("Rendered texture PNG is too large");
      super.write(value);
    }

    @Override
    public synchronized void write(byte[] bytes, int offset, int length) {
      if (length > MAX_PNG_BYTES - count)
        throw new IllegalStateException("Rendered texture PNG is too large");
      super.write(bytes, offset, length);
    }
  }
}
