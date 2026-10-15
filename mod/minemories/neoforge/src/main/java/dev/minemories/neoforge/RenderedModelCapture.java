package dev.minemories.neoforge;

import com.mojang.blaze3d.platform.GlStateManager;
import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.blaze3d.vertex.VertexFormat;
import com.mojang.blaze3d.vertex.VertexFormatElement;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderStateShard;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.resources.ResourceLocation;
import org.lwjgl.opengl.GL11;
import org.lwjgl.opengl.GL15;
import org.lwjgl.opengl.GL21;

/** Captures the renderer's transformed primitives and the texture actually used by that pass. */
final class RenderedModelCapture {
  private static final int MAX_TEXTURES = 256;
  private static final long MAX_TEXTURE_BYTES = 64L * 1024 * 1024;
  private static final long MAX_QUADS = 500_000;
  private final CaptureSink scene;
  private final Minecraft minecraft;
  private final CapturePixels pixelCopies;
  private final Map<ResourceLocation, Texture> textures = new LinkedHashMap<>();
  private final VertexConsumer ignored =
      new RenderedVertexConsumer(VertexFormat.Mode.QUADS, vertices -> {});
  private final Map<String, Texture> atlasTextures = new LinkedHashMap<>();
  private final AtlasUvIndex.SearchBudget atlasSearchBudget = new AtlasUvIndex.SearchBudget();
  private long textureBytes;
  private long quads;

  // Private ownership keeps the cached PNG inside the capture; no renderer can mutate it.
  private static final class Texture {
    private final String key;
    private final byte[] png;
    private final int alphaMode;
    private final AtlasSource atlas;

    private Texture(String key, byte[] png, int alphaMode) {
      this(key, png, alphaMode, null);
    }

    private Texture(String key, byte[] png, int alphaMode, AtlasSource atlas) {
      this.key = key;
      this.png = png;
      this.alphaMode = alphaMode;
      this.atlas = atlas;
    }
  }

  private record AtlasSource(ResourceLocation location, AtlasUvIndex<TextureAtlasSprite> index) {}

  RenderedModelCapture(CaptureSink scene, Minecraft minecraft) {
    this(scene, minecraft, null);
  }

  RenderedModelCapture(CaptureSink scene, Minecraft minecraft, CapturePixels pixelCopies) {
    this.scene = scene;
    this.minecraft = minecraft;
    this.pixelCopies = pixelCopies;
  }

  final class Buffers implements MultiBufferSource {
    private final String model;
    private final float emission;
    private final Map<RenderType, RenderedVertexConsumer> consumers = new LinkedHashMap<>();

    Buffers(String model, float emission) {
      this.model = model;
      this.emission = emission;
    }

    @Override
    public VertexConsumer getBuffer(RenderType type) {
      if (!type.format().getElements().contains(VertexFormatElement.NORMAL)
          || !supported(type.mode())) return ignored;
      return consumers.computeIfAbsent(type, this::consumer);
    }

    private RenderedVertexConsumer consumer(RenderType type) {
      if (consumers.size() >= 128)
        throw new IllegalStateException("Trop de passes de rendu dans le modèle.");
      try {
        Texture texture = texture(type);
        float light =
            type.toString().startsWith("RenderType[eyes:")
                    || type.toString().startsWith("RenderType[entity_translucent_emissive:")
                ? 1f
                : emission;
        int layer = consumers.size();
        return new RenderedVertexConsumer(
            type.mode(), vertices -> add(model, texture, vertices, light, layer));
      } catch (IOException error) {
        throw new UncheckedIOException(error);
      }
    }

    void finish() {
      for (var consumer : consumers.values()) consumer.finish();
      consumers.clear();
    }
  }

  Buffers buffers(String model, float emission) {
    return new Buffers(model, emission);
  }

  private static boolean supported(VertexFormat.Mode mode) {
    return mode == VertexFormat.Mode.QUADS
        || mode == VertexFormat.Mode.TRIANGLES
        || mode == VertexFormat.Mode.TRIANGLE_STRIP
        || mode == VertexFormat.Mode.TRIANGLE_FAN;
  }

  private Texture texture(RenderType type) throws IOException {
    if (!(type instanceof RenderType.CompositeRenderType composite))
      throw new IOException("Le renderer utilise une passe dont la texture n’est pas accessible.");
    RenderStateShard.EmptyTextureStateShard state = composite.state().textureState;
    Optional<ResourceLocation> location;
    if (state instanceof RenderStateShard.TextureStateShard single) location = single.texture;
    else if (state instanceof RenderStateShard.MultiTextureStateShard multi)
      location = multi.cutoutTexture;
    else throw new IOException("Le renderer utilise une texture procédurale non exportable.");
    ResourceLocation id =
        location.orElseThrow(() -> new IOException("Texture du renderer absente."));
    Texture existing = textures.get(id);
    if (existing != null) return existing;
    if (textures.size() + atlasTextures.size() >= MAX_TEXTURES)
      throw new IOException("Trop de textures d’entités dans cette capture.");
    Texture atlas = largeAtlas(id);
    if (atlas != null) {
      textures.put(id, atlas);
      return atlas;
    }
    if (pixelCopies != null) {
      String key = "rendered/" + id;
      pixelCopies.texture(key, id);
      Texture deferred = new Texture(key, new byte[0], 0);
      textures.put(id, deferred);
      return deferred;
    }
    byte[] png;
    int alphaMode;
    int previous = GL11.glGetInteger(GL11.GL_TEXTURE_BINDING_2D);
    int alignment = GL11.glGetInteger(GL11.GL_PACK_ALIGNMENT);
    int rowLength = GL11.glGetInteger(GL11.GL_PACK_ROW_LENGTH);
    int skipRows = GL11.glGetInteger(GL11.GL_PACK_SKIP_ROWS);
    int skipPixels = GL11.glGetInteger(GL11.GL_PACK_SKIP_PIXELS);
    int packBuffer = GL11.glGetInteger(GL21.GL_PIXEL_PACK_BUFFER_BINDING);
    try {
      // Loading a previously unseen texture can bind it too; include that step in the restore
      // scope.
      var texture = minecraft.getTextureManager().getTexture(id);
      texture.bind();
      int width = GL11.glGetTexLevelParameteri(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_WIDTH);
      int height = GL11.glGetTexLevelParameteri(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_HEIGHT);
      RenderedTexture.checkDimensions(width, height);
      try (NativeImage image = new NativeImage(width, height, false)) {
        // NativeImage only sets alignment. A mod's packing offsets/PBO must not redirect this read.
        GL15.glBindBuffer(GL21.GL_PIXEL_PACK_BUFFER, 0);
        GL11.glPixelStorei(GL11.GL_PACK_ROW_LENGTH, 0);
        GL11.glPixelStorei(GL11.GL_PACK_SKIP_ROWS, 0);
        GL11.glPixelStorei(GL11.GL_PACK_SKIP_PIXELS, 0);
        image.downloadTexture(0, false);
        int[] rgba = new int[width * height];
        for (int y = 0; y < height; y++)
          for (int x = 0; x < width; x++) rgba[y * width + x] = image.getPixelRGBA(x, y);
        RenderedTexture encoded = RenderedTexture.fromRgba(width, height, rgba);
        png = encoded.png();
        alphaMode = encoded.alphaMode();
      }
    } finally {
      GlStateManager._bindTexture(previous);
      GL11.glPixelStorei(GL11.GL_PACK_ALIGNMENT, alignment);
      GL11.glPixelStorei(GL11.GL_PACK_ROW_LENGTH, rowLength);
      GL11.glPixelStorei(GL11.GL_PACK_SKIP_ROWS, skipRows);
      GL11.glPixelStorei(GL11.GL_PACK_SKIP_PIXELS, skipPixels);
      GL15.glBindBuffer(GL21.GL_PIXEL_PACK_BUFFER, packBuffer);
    }
    if (png.length > MAX_TEXTURE_BYTES - textureBytes)
      throw new IOException("Les textures d’entités dépassent la limite de capture.");
    textureBytes += png.length;
    Texture copied = new Texture("rendered/" + id, png, alphaMode);
    textures.put(id, copied);
    return copied;
  }

  private Texture largeAtlas(ResourceLocation location) throws IOException {
    int previous = GL11.glGetInteger(GL11.GL_TEXTURE_BINDING_2D);
    try {
      var texture = minecraft.getTextureManager().getTexture(location);
      if (!(texture instanceof TextureAtlas atlas)) return null;
      texture.bind();
      int width = GL11.glGetTexLevelParameteri(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_WIDTH);
      int height = GL11.glGetTexLevelParameteri(GL11.GL_TEXTURE_2D, 0, GL11.GL_TEXTURE_HEIGHT);
      if ((long) width * height <= RenderedTexture.MAX_PIXELS) return null;
      // Some modpacks expose over 65k entries. Do not build or retain an index of all of them.
      var sprites = atlas.getTextures().values();
      Iterable<AtlasUvIndex.Region<TextureAtlasSprite>> regions =
          () ->
              sprites.stream()
                  .map(
                      sprite ->
                          new AtlasUvIndex.Region<>(
                              sprite.getU0(),
                              sprite.getV0(),
                              sprite.getU1(),
                              sprite.getV1(),
                              sprite))
                  .iterator();
      return new Texture(
          "rendered/" + location,
          new byte[0],
          0,
          new AtlasSource(location, new AtlasUvIndex<>(regions, atlasSearchBudget)));
    } finally {
      GlStateManager._bindTexture(previous);
    }
  }

  private Texture resolve(Texture texture, float[] uv) throws IOException {
    if (texture.atlas == null) return texture;
    var region = texture.atlas.index().find(uv);
    if (region == null) return null;
    var sprite = region.value();
    String key = "rendered/" + texture.atlas.location() + "/" + sprite.contents().name();
    Texture copied = atlasTextures.get(key);
    if (copied == null) {
      copied = copySprite(key, texture.atlas.location(), sprite);
      atlasTextures.put(key, copied);
    }
    region.remap(uv);
    return copied;
  }

  private Texture copySprite(String key, ResourceLocation location, TextureAtlasSprite sprite)
      throws IOException {
    if (textures.size() + atlasTextures.size() >= MAX_TEXTURES)
      throw new IOException("Trop de textures d’entités dans cette capture.");
    CapturePixels copies = pixelCopies == null ? new CapturePixels(minecraft) : pixelCopies;
    copies.textureRegion(
        key,
        location,
        sprite.getX(),
        sprite.getY(),
        sprite.contents().width(),
        sprite.contents().height());
    if (pixelCopies != null) return new Texture(key, new byte[0], 0);
    var source = copies.source(key);
    var encoder = new RenderedTexture.Rows(source.width(), source.height());
    int band = Math.max(1, QueuedGlbCapture.MAX_BAND_PIXELS / source.width());
    for (int row = 0; row < source.height(); row += band)
      encoder.append(row, source.readBand(row, Math.min(band, source.height() - row)));
    RenderedTexture encoded = encoder.finish();
    byte[] png = encoded.png();
    if (png.length > MAX_TEXTURE_BYTES - textureBytes)
      throw new IOException("Les textures d’entités dépassent la limite de capture.");
    textureBytes += png.length;
    return new Texture(key, png, encoded.alphaMode());
  }

  private void add(
      String model,
      Texture texture,
      RenderedVertices.Vertex[] vertices,
      float emission,
      int layer) {
    if (++quads > MAX_QUADS)
      throw new IllegalStateException("La géométrie des entités est trop grande.");
    float[] xyz = new float[12], uv = new float[8];
    int red = 0, green = 0, blue = 0, alpha = 0;
    for (int index = 0; index < 4; index++) {
      var vertex = vertices[index];
      xyz[index * 3] = vertex.x();
      xyz[index * 3 + 1] = vertex.y();
      xyz[index * 3 + 2] = vertex.z();
      uv[index * 2] = vertex.u();
      uv[index * 2 + 1] = vertex.v();
      red += vertex.red();
      green += vertex.green();
      blue += vertex.blue();
      alpha += vertex.alpha();
    }
    try {
      texture = resolve(texture, uv);
    } catch (IOException error) {
      throw new UncheckedIOException(error);
    }
    if (texture == null) return;
    int tint = ((red / 4) << 16) | ((green / 4) << 8) | (blue / 4);
    float opacity = alpha / (4f * 255f);
    int alphaMode = opacity < 1 ? 2 : texture.alphaMode;
    String key =
        "rendered#"
            + texture.key
            + "#"
            + tint
            + "#"
            + alphaMode
            + "#"
            + Float.floatToIntBits(opacity)
            + "#"
            + Float.floatToIntBits(emission);
    try {
      scene.addRenderedQuad(
          key,
          model + " / " + texture.key,
          texture.key,
          texture.png,
          tint,
          alphaMode,
          emission,
          opacity,
          xyz,
          uv,
          layer);
    } catch (IOException error) {
      throw new UncheckedIOException(error);
    }
  }
}
