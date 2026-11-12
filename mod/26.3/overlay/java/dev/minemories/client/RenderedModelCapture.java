package dev.minemories.client;

import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.blaze3d.vertex.DefaultVertexFormat;
import com.mojang.renderpearl.api.pipeline.PrimitiveTopology;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.resources.Identifier;

/** Captures the renderer's transformed primitives and the texture actually used by that pass. */
final class RenderedModelCapture {
  private static final org.slf4j.Logger LOGGER = com.mojang.logging.LogUtils.getLogger();
  private final CaptureSink scene;
  private final Minecraft minecraft;
  private final CapturePixels pixelCopies;
  private final Map<Identifier, Texture> textures = new LinkedHashMap<>();
  private final VertexConsumer ignored =
      new RenderedVertexConsumer(PrimitiveTopology.QUADS, vertices -> {});
  private final Map<String, Texture> atlasTextures = new LinkedHashMap<>();
  private final AtlasUvIndex.SearchBudget atlasSearchBudget = new AtlasUvIndex.SearchBudget();
  private final java.util.Set<String> refused = new java.util.HashSet<>();
  private final RenderedBudget budget;
  private final boolean constantAmbient;

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

  private record AtlasSource(
      Identifier location, AtlasUvIndex<TextureAtlasSprite> index, int width, int height) {}

  void classify(dev.minemories.core.GlbCategory category, int chunkX, int chunkZ) {
    scene.classify(category, chunkX, chunkZ);
  }

  RenderedModelCapture(CaptureSink scene, Minecraft minecraft) {
    this(scene, minecraft, null);
  }

  RenderedModelCapture(CaptureSink scene, Minecraft minecraft, CapturePixels pixelCopies) {
    this(scene, minecraft, pixelCopies, new RenderedBudget());
  }

  RenderedModelCapture(
      CaptureSink scene, Minecraft minecraft, CapturePixels pixelCopies, RenderedBudget budget) {
    this.scene = scene;
    this.minecraft = minecraft;
    this.pixelCopies = pixelCopies;
    this.budget = budget;
    // 26.3 replaced getShade with CardinalLighting (not ported yet): only the Overworld rule applies.
    this.constantAmbient = false;
  }

  /** Logs what the limits dropped from this capture (counts only), once the capture is done. */
  void reportSkipped() {
    if (budget.anySkipped())
      LOGGER.warn("Entity renderers over capture limits: {}", budget.summary());
  }

  final class Buffers {
    private final String model;
    private final float emission;
    private final Map<RenderType, RenderedVertexConsumer> consumers = new LinkedHashMap<>();

    Buffers(String model, float emission) {
      this.model = model;
      this.emission = emission;
    }

    /** The vertex consumer a submitted model of this render type draws into (a no-op if refused). */
    VertexConsumer getBuffer(RenderType type) {
      if (EndPortalLook.matches(type.toString())) return portalBuffer(type);
      if (!type.format().contains(DefaultVertexFormat.NORMAL_SEMANTIC_NAME)
          || !supported(type.primitiveTopology())) return ignored;
      RenderedVertexConsumer existing = consumers.get(type);
      if (existing != null) return existing;
      // A refused pass or texture is dropped for this model only; the capture goes on without it.
      if (!budget.admitPass(consumers.size())) return ignored;
      RenderedVertexConsumer created = consumer(type);
      if (created == null) return ignored;
      consumers.put(type, created);
      return created;
    }

    /** The End portal and gateway sample no copyable texture: they get a baked still frame instead. */
    private VertexConsumer portalBuffer(RenderType type) {
      if (!supported(type.primitiveTopology())) return ignored;
      RenderedVertexConsumer existing = consumers.get(type);
      if (existing != null) return existing;
      if (!budget.admitPass(consumers.size())) return ignored;
      try {
        Texture texture = portalTexture();
        if (texture == null) return ignored;
        int layer = consumers.size();
        // The shader is not lit by the world: full emission.
        RenderedVertexConsumer created =
            new RenderedVertexConsumer(
                type.primitiveTopology(),
                vertices -> add(model, texture, EndPortalLook.planar(vertices), 1f, layer));
        consumers.put(type, created);
        return created;
      } catch (IOException error) {
        LOGGER.warn("End portal surface not captured: {}", error.toString());
        return ignored;
      }
    }

    private RenderedVertexConsumer consumer(RenderType type) {
      if (refused.contains("pass/" + type)) return null;
      try {
        Texture texture = texture(type);
        if (texture == null) return null;
        float light =
            type.toString().startsWith("RenderType[eyes:")
                    || type.toString().startsWith("RenderType[entity_translucent_emissive:")
                ? 1f
                : emission;
        int layer = consumers.size();
        return new RenderedVertexConsumer(
            type.primitiveTopology(), vertices -> add(model, texture, vertices, light, layer));
      } catch (IOException error) {
        // An oversized or unreadable texture drops this render pass only, as a refused one does;
        // it must not abort the whole capture. The pass is logged once and not retried.
        unreadable(type, error.getMessage());
        return null;
      }
    }

    void finish() {
      for (var consumer : consumers.values()) consumer.finish();
      consumers.clear();
    }
  }

  private Texture portal;
  private boolean portalRefused;

  private Texture portalTexture() throws IOException {
    if (portal != null || portalRefused) return portal;
    String key = "rendered/" + EndPortalLook.KEY;
    if (!budget.admitTexture(textures.size() + atlasTextures.size())) {
      portalRefused = true;
      return null;
    }
    CapturePixels reader = new CapturePixels(minecraft);
    reader.texture("end_sky", Identifier.fromNamespaceAndPath("minecraft", EndPortalLook.SKY));
    reader.texture("end_portal", Identifier.fromNamespaceAndPath("minecraft", EndPortalLook.PORTAL));
    var sky = reader.source("end_sky");
    var layers = reader.source("end_portal");
    int[] baked =
        EndPortalLook.bake(
            sky.readBand(0, sky.height()), sky.width(), layers.readBand(0, layers.height()), layers.width());
    CapturePixels copies = pixelCopies == null ? reader : pixelCopies;
    copies.procedural(key, baked, EndPortalLook.SIZE, EndPortalLook.SIZE);
    portal = finishCopy(key, copies);
    if (portal == null) portalRefused = true;
    return portal;
  }

  Buffers buffers(String model, float emission) {
    return new Buffers(model, emission);
  }

  private static boolean supported(PrimitiveTopology mode) {
    return mode == PrimitiveTopology.QUADS
        || mode == PrimitiveTopology.TRIANGLES
        || mode == PrimitiveTopology.TRIANGLE_STRIP
        || mode == PrimitiveTopology.TRIANGLE_FAN;
  }

  /**
   * A pass whose texture cannot be read (drawn by a shader, or bound outside the render type, as some
   * modded entity renderers do) is dropped for this model, warned about once; the capture goes on.
   */
  private Texture unreadable(RenderType type, String reason) {
    if (refused.add("pass/" + type)) LOGGER.warn("Render pass not captured ({}): {}", reason, type);
    return null;
  }

  private Texture texture(RenderType type) throws IOException {
    Identifier id = textureLocation(type);
    if (id == null) return unreadable(type, "procedural texture");
    Texture existing = textures.get(id);
    if (existing != null) return existing;
    String refusal = "rendered/" + id;
    if (refused.contains(refusal)) return null;
    if (!budget.admitTexture(textures.size() + atlasTextures.size())) {
      refused.add(refusal);
      return null;
    }
    Texture atlas = largeAtlas(id);
    if (atlas != null) {
      textures.put(id, atlas);
      return atlas;
    }
    // Entity textures are read from the resource pack, atlases from the GPU (see CapturePixels).
    Texture copied = copyRegion(refusal, id, 0, 0, 0, 0, false);
    if (copied == null) return null;
    textures.put(id, copied);
    return copied;
  }

  /** The first texture a render type samples; the pass's colour texture for every vanilla type. */
  private static Identifier textureLocation(RenderType type) {
    var bindings = type.state.textures;
    if (bindings.isEmpty()) return null;
    return bindings.values().iterator().next().location();
  }

  private Texture largeAtlas(Identifier location) {
    var texture = minecraft.getTextureManager().getTexture(location);
    if (!(texture instanceof TextureAtlas atlas)) return null;
    int width = texture.getTexture().getWidth(0);
    int height = texture.getTexture().getHeight(0);
    if ((long) width * height <= RenderedTexture.MAX_PIXELS) return null;
    // Some modpacks expose over 65k entries. Do not build or retain an index of all of them.
    var sprites = ClientPlatforms.current().atlasSprites(atlas);
    Iterable<AtlasUvIndex.Region<TextureAtlasSprite>> regions =
        () ->
            sprites.stream()
                .map(
                    sprite ->
                        new AtlasUvIndex.Region<>(
                            sprite.getU0(), sprite.getV0(), sprite.getU1(), sprite.getV1(), sprite))
                .iterator();
    return new Texture(
        "rendered/" + location,
        new byte[0],
        0,
        new AtlasSource(location, new AtlasUvIndex<>(regions, atlasSearchBudget), width, height));
  }

  private Texture resolve(Texture texture, float[] uv) throws IOException {
    if (texture.atlas == null) return texture;
    var atlas = texture.atlas;
    var crop = AtlasUvCrop.of(uv, atlas.width(), atlas.height());
    if (crop == null) return null;
    String cropKey = "rendered/" + atlas.location() + "/" + crop.suffix();
    Texture fallback = atlasTextures.get(cropKey);
    if (fallback != null) {
      crop.remap(uv);
      return fallback;
    }
    AtlasUvIndex.Region<TextureAtlasSprite> region;
    try {
      region = atlas.index().find(uv);
    } catch (AtlasUvIndex.NoMatchingSpriteException missing) {
      Texture copied =
          copyRegion(
              cropKey, atlas.location(), crop.x(), crop.y(), crop.width(), crop.height(), true);
      if (copied == null) return null;
      atlasTextures.put(cropKey, copied);
      crop.remap(uv);
      return copied;
    }
    if (region == null) return null;
    var sprite = region.value();
    String key = "rendered/" + texture.atlas.location() + "/" + sprite.contents().name();
    Texture copied = atlasTextures.get(key);
    if (copied == null) {
      copied =
          copyRegion(
              key,
              atlas.location(),
              sprite.getX(),
              sprite.getY(),
              sprite.contents().width(),
              sprite.contents().height(),
              true);
      if (copied == null) return null;
      atlasTextures.put(key, copied);
    }
    region.remap(uv);
    return copied;
  }

  private Texture copyRegion(
      String key, Identifier location, int x, int y, int width, int height, boolean admit)
      throws IOException {
    if (refused.contains(key)) return null;
    if (admit && !budget.admitTexture(textures.size() + atlasTextures.size())) {
      refused.add(key);
      return null;
    }
    CapturePixels copies = pixelCopies == null ? new CapturePixels(minecraft) : pixelCopies;
    copies.textureRegion(key, location, x, y, width, height);
    return finishCopy(key, copies);
  }

  /** The texture of a source the capture holds: queued for the pump, or encoded on the spot. */
  private Texture finishCopy(String key, CapturePixels copies) throws IOException {
    if (pixelCopies != null) return new Texture(key, new byte[0], 0);
    var source = copies.source(key);
    var encoder = new RenderedTexture.Rows(source.width(), source.height());
    int band = Math.max(1, QueuedGlbCapture.MAX_BAND_PIXELS / source.width());
    for (int row = 0; row < source.height(); row += band)
      encoder.append(row, source.readBand(row, Math.min(band, source.height() - row)));
    RenderedTexture encoded = encoder.finish();
    byte[] png = encoded.png();
    if (!budget.admitBytes(png.length)) {
      refused.add(key);
      return null;
    }
    return new Texture(key, png, encoded.alphaMode());
  }

  private void add(
      String model,
      Texture texture,
      RenderedVertices.Vertex[] vertices,
      float emission,
      int layer) {
    if (!budget.admitQuad()) return;
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
    // The viewer lights faces itself: drop the directional shade the renderer baked in.
    int tint =
        RenderedShade.unshade(
            ((red / 4) << 16) | ((green / 4) << 8) | (blue / 4), xyz, constantAmbient);
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
