package dev.minemories.core;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import javax.imageio.ImageIO;

/**
 * Keeps every potentially sampled atlas texel intact without changing UVs, dimensions or samplers.
 */
final class AtlasTexture {
  private static final int MAX_PIXELS = 4 * 1024 * 1024;
  static final int MAX_BYTES = 16 * 1024 * 1024;
  private static final long PNG_SIGNATURE = 0x89504e470d0a1a0aL;

  private AtlasTexture() {}

  static final class Usage {
    private final boolean atlas;
    private boolean repeat;
    private float minU = 1, minV = 1, maxU, maxV;

    Usage(String key) {
      atlas = key.startsWith("rendered/") && key.contains("textures/atlas/");
    }

    boolean candidate() {
      return atlas && !repeat && minU <= maxU && minV <= maxV;
    }

    void include(float[] uv) {
      if (!atlas || repeat) return;
      for (int index = 0; index < uv.length; index += 2) {
        float u = uv[index], v = uv[index + 1];
        // Repeated coordinates and the exact upper edge could sample the opposite atlas edge.
        if (!Float.isFinite(u) || !Float.isFinite(v) || u < 0 || v < 0 || u >= 1 || v >= 1) {
          repeat = true;
          return;
        }
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
      }
    }

    byte[] optimize(byte[] original) throws IOException {
      interrupted();
      int[] size = dimensions(original);
      if (!candidate() || size == null) return original;
      int width = size[0], height = size[1];
      int x0 = Math.max(0, (int) Math.floor(minU * width) - 1);
      int y0 = Math.max(0, (int) Math.floor(minV * height) - 1);
      int x1 = Math.min(width, (int) Math.floor(maxU * width) + 2);
      int y1 = Math.min(height, (int) Math.floor(maxV * height) + 2);
      if ((long) (x1 - x0) * (y1 - y0) * 2 >= (long) width * height) return original;
      byte[] result = mask(original, width, height, x0, y0, x1, y1);
      interrupted();
      return result.length < original.length ? result : original;
    }
  }

  private static int[] dimensions(byte[] png) {
    if (png.length < 33 || png.length > MAX_BYTES) return null;
    ByteBuffer header = ByteBuffer.wrap(png).order(ByteOrder.BIG_ENDIAN);
    if (header.getLong() != PNG_SIGNATURE || header.getInt() != 13 || header.getInt() != 0x49484452)
      return null;
    int width = header.getInt(), height = header.getInt();
    if (width < 64
        || height < 64
        || width > 16384
        || height > 16384
        || (long) width * height > MAX_PIXELS) return null;
    return new int[] {width, height};
  }

  private static byte[] mask(byte[] original, int width, int height, int x0, int y0, int x1, int y1)
      throws IOException {
    try {
      BufferedImage image = ImageIO.read(new ByteArrayInputStream(original));
      if (image == null || image.getWidth() != width || image.getHeight() != height)
        return original;
      int[] zeros = new int[width];
      for (int row = 0; row < height; row++) {
        if ((row & 63) == 0) interrupted();
        if (row < y0 || row >= y1) image.setRGB(0, row, width, 1, zeros, 0, width);
        else {
          if (x0 > 0) image.setRGB(0, row, x0, 1, zeros, 0, width);
          if (x1 < width) image.setRGB(x1, row, width - x1, 1, zeros, 0, width);
        }
      }
      var output = new LimitedPng(original.length);
      if (!ImageIO.write(image, "png", output)) return original;
      return output.toByteArray();
    } catch (IOException | RuntimeException ignored) {
      interrupted();
      // Optimization must not make an otherwise accepted texture fail or grow.
      return original;
    }
  }

  private static void interrupted() throws InterruptedIOException {
    if (Thread.currentThread().isInterrupted())
      throw new InterruptedIOException("Atlas optimization interrupted");
  }

  private static final class LimitedPng extends ByteArrayOutputStream {
    private final int maximum;

    LimitedPng(int maximum) {
      this.maximum = maximum;
    }

    @Override
    public synchronized void write(int value) {
      if (count == maximum) throw new IllegalStateException("PNG optimization grew the texture");
      super.write(value);
    }

    @Override
    public synchronized void write(byte[] bytes, int offset, int length) {
      if (length > maximum - count)
        throw new IllegalStateException("PNG optimization grew the texture");
      super.write(bytes, offset, length);
    }
  }
}
