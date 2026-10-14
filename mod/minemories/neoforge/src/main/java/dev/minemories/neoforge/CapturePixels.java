package dev.minemories.neoforge;

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
  interface Source {
    String key();

    int width();

    int height();

    int[] readBand(int row, int rows) throws IOException;
  }

  private final Minecraft minecraft;
  private final Map<String, Source> sources = new LinkedHashMap<>();
  private long pixels;
  private int rendererTextures;

  CapturePixels(Minecraft minecraft) {
    this.minecraft = minecraft;
  }

  void sprite(TextureAtlasSprite sprite) throws IOException {
    String key = sprite.contents().name().toString();
    if (sources.containsKey(key)) return;
    add(new SpriteSource(key, sprite));
  }

  void texture(String key, ResourceLocation location) throws IOException {
    if (sources.containsKey(key)) return;
    if (rendererTextures == 256)
      throw new IOException("Trop de textures de renderers dans la capture.");
    // Loading a texture can bind it; preserve the binding around that operation too.
    int previous = GL11.glGetInteger(GL11.GL_TEXTURE_BINDING_2D);
    try {
      AbstractTexture texture = minecraft.getTextureManager().getTexture(location);
      texture.bind();
      int width = GL11.glGetTexLevelParameteri(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_WIDTH);
      int height = GL11.glGetTexLevelParameteri(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_HEIGHT);
      add(new TextureSource(key, texture, texture.getId(), width, height));
      rendererTextures++;
    } finally {
      GlStateManager._bindTexture(previous);
    }
  }

  private void add(Source source) throws IOException {
    RenderedTexture.checkDimensions(source.width(), source.height());
    long amount = (long) source.width() * source.height();
    if (sources.size() == 1024 || amount > 64L * 1024 * 1024 - pixels)
      throw new IOException("Le budget de pixels de la capture est dépassé.");
    sources.put(source.key(), source);
    pixels += amount;
  }

  Source source(String key) throws IOException {
    Source source = sources.get(key);
    if (source == null) throw new IOException("Source de texture absente de la capture.");
    return source;
  }

  private static void validateBand(Source source, int row, int rows) throws IOException {
    if (row < 0
        || rows < 1
        || row > source.height() - rows
        || (long) rows * source.width() > QueuedGlbCapture.MAX_BAND_PIXELS)
      throw new IOException("Bande de texture hors limites.");
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
          rgba[y * width() + x] = sprite.getPixelRGBA(0, x, row + y);
      return rgba;
    }
  }

  private record TextureSource(String key, AbstractTexture texture, int id, int width, int height)
      implements Source {
    @Override
    public int[] readBand(int row, int rows) throws IOException {
      RenderSystem.assertOnRenderThread();
      validateBand(this, row, rows);
      if (texture.getId() != id) throw new IOException("Texture remplacée pendant la capture.");
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
        if (framebuffer == 0) throw new IOException("Framebuffer de copie indisponible.");
        texture.bind();
        if (GL11.glGetTexLevelParameteri(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_WIDTH) != width
            || GL11.glGetTexLevelParameteri(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_HEIGHT)
                != height)
          throw new IOException("Dimensions de texture modifiées pendant la capture.");
        GL30.glBindFramebuffer(GL30.GL_READ_FRAMEBUFFER, framebuffer);
        GL30.glFramebufferTexture2D(
            GL30.GL_READ_FRAMEBUFFER, GL30.GL_COLOR_ATTACHMENT0, GL11.GL_TEXTURE_2D, id, 0);
        GL11.glReadBuffer(GL30.GL_COLOR_ATTACHMENT0);
        if (GL30.glCheckFramebufferStatus(GL30.GL_READ_FRAMEBUFFER) != GL30.GL_FRAMEBUFFER_COMPLETE)
          throw new IOException(
              "Le renderer utilise une texture qui ne peut pas être lue par bandes.");
        GL15.glBindBuffer(GL21.GL_PIXEL_PACK_BUFFER, 0);
        GL11.glPixelStorei(GL11.GL_PACK_ALIGNMENT, 4);
        GL11.glPixelStorei(GL11.GL_PACK_ROW_LENGTH, 0);
        GL11.glPixelStorei(GL11.GL_PACK_SKIP_ROWS, 0);
        GL11.glPixelStorei(GL11.GL_PACK_SKIP_PIXELS, 0);
        GL11.glReadPixels(0, row, width, rows, GL11.GL_RGBA, GL11.GL_UNSIGNED_BYTE, bytes);
        if (GL11.glGetError() != GL11.GL_NO_ERROR)
          throw new IOException("La lecture graphique de la texture a échoué.");
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
