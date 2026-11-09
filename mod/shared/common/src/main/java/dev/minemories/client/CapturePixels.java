package dev.minemories.client;

import com.mojang.blaze3d.platform.GlStateManager;
import com.mojang.blaze3d.systems.RenderSystem;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.AbstractTexture;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.resources.ResourceLocation;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL15;
import org.lwjgl.opengl.GL21;
import org.lwjgl.opengl.GL30;
import org.lwjgl.system.MemoryUtil;

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

  void texture(String key, ResourceLocation location) throws IOException {
    textureRegion(key, location, 0, 0, 0, 0);
  }

  void textureRegion(String key, ResourceLocation location, int x, int y, int width, int height)
      throws IOException {
    if (sources.containsKey(key)) return;
    if (rendererTextures == 256)
      throw new IOException("Too many renderer textures in the capture.");
    int previous = GL11.glGetInteger(GL11.GL_TEXTURE_BINDING_2D);
    try {
      AbstractTexture texture = minecraft.getTextureManager().getTexture(location);
      texture.bind();
      int textureWidth = GL11.glGetTexLevelParameteri(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_WIDTH);
      int textureHeight =
          GL11.glGetTexLevelParameteri(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_HEIGHT);
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
      add(
          new TextureSource(
              key, texture, texture.getId(), textureWidth, textureHeight, x, y, width, height));
      rendererTextures++;
    } finally {
      GlStateManager._bindTexture(previous);
    }
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

  private static void startGraphicsRead() throws IOException {
    // GL errors belong to the shared context and remain queued after unrelated renderers return.
    // Report earlier errors separately so the post-read check diagnoses only this copy's work.
    int first = GL11.glGetError();
    if (first == GL11.GL_NO_ERROR) return;
    for (int count = 1; count <= 32; count++) {
      if (GL11.glGetError() == GL11.GL_NO_ERROR) {
        LOGGER.warn(
            "OpenGL errors already pending before texture copy: first={}, count={}", first, count);
        return;
      }
    }
    throw new IOException("The graphics state is still in error before the texture copy.");
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

  private record TextureSource(
      String key,
      AbstractTexture texture,
      int id,
      int textureWidth,
      int textureHeight,
      int x,
      int y,
      int width,
      int height)
      implements Source {
    @Override
    public int[] readBand(int row, int rows) throws IOException {
      RenderSystem.assertOnRenderThread();
      validateBand(this, row, rows);
      if (texture.getId() != id) throw new IOException("Texture replaced during the capture.");
      startGraphicsRead();
      int previousTexture = GL11.glGetInteger(GL11.GL_TEXTURE_BINDING_2D);
      int previousFramebuffer = GL11.glGetInteger(GL30.GL_READ_FRAMEBUFFER_BINDING);
      int previousReadBuffer = GL11.glGetInteger(GL11.GL_READ_BUFFER);
      int alignment = GL11.glGetInteger(GL11.GL_PACK_ALIGNMENT);
      int rowLength = GL11.glGetInteger(GL11.GL_PACK_ROW_LENGTH);
      int skipRows = GL11.glGetInteger(GL11.GL_PACK_SKIP_ROWS);
      int skipPixels = GL11.glGetInteger(GL11.GL_PACK_SKIP_PIXELS);
      int packBuffer = GL11.glGetInteger(GL21.GL_PIXEL_PACK_BUFFER_BINDING);
      int framebuffer = 0;
      ByteBuffer bytes = MemoryUtil.memCalloc(width * rows * 4);
      try {
        framebuffer = GL30.glGenFramebuffers();
        if (framebuffer == 0) throw new IOException("Copy framebuffer unavailable.");
        texture.bind();
        if (GL11.glGetTexLevelParameteri(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_WIDTH)
                != textureWidth
            || GL11.glGetTexLevelParameteri(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_HEIGHT)
                != textureHeight)
          throw new IOException("Texture dimensions changed during the capture.");
        GL30.glBindFramebuffer(GL30.GL_READ_FRAMEBUFFER, framebuffer);
        GL30.glFramebufferTexture2D(
            GL30.GL_READ_FRAMEBUFFER, GL30.GL_COLOR_ATTACHMENT0, GL11.GL_TEXTURE_2D, id, 0);
        GL11.glReadBuffer(GL30.GL_COLOR_ATTACHMENT0);
        if (GL30.glCheckFramebufferStatus(GL30.GL_READ_FRAMEBUFFER) != GL30.GL_FRAMEBUFFER_COMPLETE)
          throw new IOException("The renderer uses a texture that cannot be read in strips.");
        GL15.glBindBuffer(GL21.GL_PIXEL_PACK_BUFFER, 0);
        GL11.glPixelStorei(GL11.GL_PACK_ALIGNMENT, 4);
        GL11.glPixelStorei(GL11.GL_PACK_ROW_LENGTH, 0);
        GL11.glPixelStorei(GL11.GL_PACK_SKIP_ROWS, 0);
        GL11.glPixelStorei(GL11.GL_PACK_SKIP_PIXELS, 0);
        GL11.glReadPixels(x, y + row, width, rows, GL11.GL_RGBA, GL11.GL_UNSIGNED_BYTE, bytes);
        if (GL11.glGetError() != GL11.GL_NO_ERROR)
          throw new IOException("Reading the texture from the GPU failed.");
        int[] rgba = new int[width * rows];
        bytes.order(ByteOrder.LITTLE_ENDIAN).asIntBuffer().get(rgba);
        return rgba;
      } finally {
        MemoryUtil.memFree(bytes);
        GL30.glBindFramebuffer(GL30.GL_READ_FRAMEBUFFER, previousFramebuffer);
        GL11.glReadBuffer(previousReadBuffer);
        GL30.glDeleteFramebuffers(framebuffer);
        GlStateManager._bindTexture(previousTexture);
        GL11.glPixelStorei(GL11.GL_PACK_ALIGNMENT, alignment);
        GL11.glPixelStorei(GL11.GL_PACK_ROW_LENGTH, rowLength);
        GL11.glPixelStorei(GL11.GL_PACK_SKIP_ROWS, skipRows);
        GL11.glPixelStorei(GL11.GL_PACK_SKIP_PIXELS, skipPixels);
        GL15.glBindBuffer(GL21.GL_PIXEL_PACK_BUFFER, packBuffer);
      }
    }
  }
}
