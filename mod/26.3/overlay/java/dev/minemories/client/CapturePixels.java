package dev.minemories.client;

import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.systems.RenderSystem;
import com.mojang.renderpearl.api.GpuFormat;
import com.mojang.renderpearl.api.buffers.GpuBuffer;
import com.mojang.renderpearl.api.textures.GpuTexture;
import java.io.IOException;
import java.nio.ByteOrder;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.AbstractTexture;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.client.renderer.texture.ReloadableTexture;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.resources.Identifier;

/**
 * Client-owned sources. Only the int[] returned by readBand can be sent to the preparation worker.
 */
final class CapturePixels {
  private static final org.slf4j.Logger LOGGER = com.mojang.logging.LogUtils.getLogger();

  interface Source extends ProgressiveCapturePump.Pixels {
    String key();

    int width();

    int height();

    int[] readBand(int row, int rows) throws IOException;
  }

  private final Minecraft minecraft;
  private final Map<String, Source> sources = new LinkedHashMap<>();
  private long pixels;
  private int rendererTextures;
  private long readNanos;

  CapturePixels(Minecraft minecraft) {
    this.minecraft = minecraft;
  }

  void sprite(TextureAtlasSprite sprite) throws IOException {
    String key = sprite.contents().name().toString();
    if (sources.containsKey(key)) return;
    add(new SpriteSource(key, sprite));
  }

  void texture(String key, Identifier location) throws IOException {
    textureRegion(key, location, 0, 0, 0, 0);
  }

  void textureRegion(String key, Identifier location, int x, int y, int width, int height)
      throws IOException {
    if (sources.containsKey(key)) return;
    if (rendererTextures == 256)
      throw new IOException("Too many renderer textures in the capture.");
    AbstractTexture texture = minecraft.getTextureManager().getTexture(location);
    GpuTexture gpu = texture.getTexture();
    int textureWidth = gpu.getWidth(0);
    int textureHeight = gpu.getHeight(0);
    if (width == 0 && height == 0) {
      width = textureWidth;
      height = textureHeight;
    }
    if (x < 0
        || y < 0
        || width < 1
        || height < 1
        || x > textureWidth - width
        || y > textureHeight - height) throw new IOException("Texture region out of bounds.");
    // Atlases can be copied back from the GPU. Most single textures are upload-only (no
    // USAGE_COPY_SRC), so those are read from their source image instead.
    if ((gpu.usage() & GpuTexture.USAGE_COPY_SRC) != 0)
      add(new GpuSource(key, texture, gpu, x, y, width, height));
    else add(new ImageSource(key, imagePixels(texture, textureWidth, textureHeight, x, y, width, height), width, height));
    rendererTextures++;
  }

  private int[] imagePixels(
      AbstractTexture texture, int textureWidth, int textureHeight, int x, int y, int width, int height)
      throws IOException {
    if (texture instanceof DynamicTexture dynamic && dynamic.getPixels() != null)
      return crop(dynamic.getPixels(), textureWidth, textureHeight, x, y, width, height);
    if (texture instanceof ReloadableTexture reloadable) {
      try (var contents = reloadable.loadContents(minecraft.getResourceManager())) {
        return crop(contents.image(), textureWidth, textureHeight, x, y, width, height);
      }
    }
    throw new IOException("The renderer uses a texture that cannot be read back.");
  }

  private static int[] crop(
      NativeImage image, int textureWidth, int textureHeight, int x, int y, int width, int height)
      throws IOException {
    if (image.getWidth() != textureWidth || image.getHeight() != textureHeight)
      throw new IOException("Texture dimensions changed during the capture.");
    int[] abgr = image.getPixelsABGR();
    int[] rgba = new int[width * height];
    for (int row = 0; row < height; row++)
      System.arraycopy(abgr, (y + row) * textureWidth + x, rgba, row * width, width);
    return rgba;
  }

  /** Registers a texture the game does not hold (built by the capture) as a pixel source. */
  void procedural(String key, int[] abgr, int width, int height) throws IOException {
    if (sources.containsKey(key)) return;
    add(new ArrayPixels(key, abgr, width, height));
  }

  private void add(Source source) throws IOException {
    RenderedTexture.checkDimensions(source.width(), source.height());
    long amount = (long) source.width() * source.height();
    if (sources.size() == 1024 || amount > 64L * 1024 * 1024 - pixels)
      throw new IOException("The capture pixel budget was exceeded.");
    sources.put(source.key(), new TimedSource(source));
    pixels += amount;
  }

  Source source(String key) throws IOException {
    Source source = sources.get(key);
    if (source == null) throw new IOException("Texture source missing from the capture.");
    return source;
  }

  long readNanos() {
    return readNanos;
  }

  private final class TimedSource implements Source {
    private final Source source;

    private TimedSource(Source source) {
      this.source = source;
    }

    public String key() {
      return source.key();
    }

    public int width() {
      return source.width();
    }

    public int height() {
      return source.height();
    }

    public int[] readBand(int row, int rows) throws IOException {
      long started = System.nanoTime();
      try {
        return source.readBand(row, rows);
      } finally {
        readNanos += System.nanoTime() - started;
      }
    }
  }

  private static void validateBand(Source source, int row, int rows) throws IOException {
    if (row < 0
        || rows < 1
        || row > source.height() - rows
        || (long) rows * source.width() > QueuedGlbCapture.MAX_BAND_PIXELS)
      throw new IOException("Texture strip out of bounds.");
  }

  private record SpriteSource(String key, TextureAtlasSprite sprite) implements Source {
    @Override
    public int width() {
      return sprite.contents().width();
    }

    @Override
    public int height() {
      return sprite.contents().height();
    }

    @Override
    public int[] readBand(int row, int rows) throws IOException {
      RenderSystem.assertOnRenderThread();
      validateBand(this, row, rows);
      int[] rgba = new int[width() * rows];
      for (int y = 0; y < rows; y++)
        for (int x = 0; x < width(); x++)
          rgba[y * width() + x] = ClientPlatforms.current().spritePixel(sprite, x, row + y);
      return rgba;
    }
  }

  /** Pixels already copied out of the texture's source image. */
  private static final class ImageSource implements Source {
    private final String key;
    private final int[] rgba;
    private final int width;
    private final int height;

    private ImageSource(String key, int[] rgba, int width, int height) {
      this.key = key;
      this.rgba = rgba;
      this.width = width;
      this.height = height;
    }

    @Override
    public String key() {
      return key;
    }

    @Override
    public int width() {
      return width;
    }

    @Override
    public int height() {
      return height;
    }

    @Override
    public int[] readBand(int row, int rows) throws IOException {
      validateBand(this, row, rows);
      int[] band = new int[width * rows];
      System.arraycopy(rgba, row * width, band, 0, band.length);
      return band;
    }
  }

  /**
   * Copies one band of rows straight into a band-sized buffer (the region overload of copyTextureToBuffer),
   * so an atlas of tens of megapixels never needs a buffer as large as the whole texture.
   */
  private static final class GpuSource implements Source {
    private final String key;
    private final AbstractTexture texture;
    private final GpuTexture gpu;
    private final int x;
    private final int y;
    private final int width;
    private final int height;

    private GpuSource(
        String key, AbstractTexture texture, GpuTexture gpu, int x, int y, int width, int height) {
      this.key = key;
      this.texture = texture;
      this.gpu = gpu;
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }

    @Override
    public String key() {
      return key;
    }

    @Override
    public int width() {
      return width;
    }

    @Override
    public int height() {
      return height;
    }

    @Override
    public int[] readBand(int row, int rows) throws IOException {
      RenderSystem.assertOnRenderThread();
      validateBand(this, row, rows);
      if (texture.getTexture() != gpu) throw new IOException("Texture replaced during the capture.");
      var device = RenderSystem.getDevice();
      var encoder = device.createCommandEncoder();
      try (GpuBuffer buffer =
              device.createBuffer(
                  () -> "minemories band",
                  GpuBuffer.USAGE_COPY_DST | GpuBuffer.USAGE_MAP_READ,
                  (long) width * rows * GpuFormat.RGBA8_UNORM.blockSize())) {
        // The callback is a fenced task that runs on a later frame; mapping the buffer is what waits.
        encoder.copyTextureToBuffer(gpu, buffer, 0L, () -> {}, 0, x, y + row, width, rows);
        try (var view = buffer.map(true, false)) {
          int[] rgba = new int[width * rows];
          // RGBA bytes read as little-endian ints are the ABGR pixels the PNG encoder expects.
          view.data().order(ByteOrder.LITTLE_ENDIAN).asIntBuffer().get(rgba);
          return rgba;
        }
      }
    }
  }
}
