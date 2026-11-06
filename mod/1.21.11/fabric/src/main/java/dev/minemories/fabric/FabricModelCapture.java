package dev.minemories.fabric;

import dev.minemories.client.ClientPlatform;
import dev.minemories.client.VertexColors;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.renderer.v1.Renderer;
import net.fabricmc.fabric.api.renderer.v1.mesh.QuadAtlas;
import net.fabricmc.fabric.api.renderer.v1.mesh.QuadView;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.chunk.ChunkSectionLayer;
import net.minecraft.client.renderer.block.model.BlockStateModel;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Since 1.21.5 a block model emits its geometry through {@code emitQuads}. The quads are collected
 * in a Fabric mesh (so custom models and vanilla ones go through the same path), then handed to the
 * shared capture as baked quads one at a time.
 */
final class FabricModelCapture {
  private static final int MAX_QUADS = 4096;
  private final Minecraft minecraft;
  private final ClientPlatform.ModelRequest request;
  private final BlockState state;
  private final Predicate<Direction> visible;
  private final ClientPlatform.QuadSink sink;

  FabricModelCapture(
      Minecraft minecraft,
      BlockState state,
      ClientPlatform.ModelRequest request,
      Predicate<Direction> visible,
      ClientPlatform.QuadSink sink) {
    this.minecraft = minecraft;
    this.state = state;
    this.request = request;
    this.visible = visible;
    this.sink = sink;
  }

  void capture(BlockStateModel model) throws IOException {
    Renderer renderer;
    try {
      renderer = Renderer.get();
    } catch (UnsupportedOperationException unavailable) {
      throw new IOException("Renderer Fabric indisponible pour ce modèle.", unavailable);
    }
    var mesh = renderer.mutableMesh();
    try {
      // The model may skip culled faces early, or emit them anyway; accept() filters either way.
      model.emitQuads(
          mesh.emitter(),
          minecraft.level,
          request.pos(),
          state,
          RandomSource.create(request.seed()),
          face -> !visible.test(face));
      if (mesh.size() > MAX_QUADS)
        throw new IOException("Trop de primitives dans ce modèle Fabric.");
      mesh.forEach(this::accept);
    } catch (UncheckedIOException error) {
      throw error.getCause();
    }
  }

  private void accept(QuadView quad) {
    if (!visible.test(quad.cullFace())) return;
    for (int i = 0; i < 4; i++)
      if (!(Float.isFinite(quad.x(i))
          && Float.isFinite(quad.y(i))
          && Float.isFinite(quad.z(i))
          && Float.isFinite(quad.u(i))
          && Float.isFinite(quad.v(i)))) return;
    if (quad.atlas() != QuadAtlas.BLOCK)
      throw new UncheckedIOException(new IOException("Un modèle de bloc utilise l’atlas d’objets."));
    var atlas = (TextureAtlas) minecraft.getTextureManager().getTexture(TextureAtlas.LOCATION_BLOCKS);
    TextureAtlasSprite sprite = atlas.spriteFinder().find(quad);
    for (int i = 0; i < 4; i++)
      if (quad.u(i) < sprite.getU0() - .000001f
          || quad.u(i) > sprite.getU1() + .000001f
          || quad.v(i) < sprite.getV0() - .000001f
          || quad.v(i) > sprite.getV1() + .000001f)
        throw new UncheckedIOException(
            new IOException("Les UV Fabric traversent plusieurs sprites."));
    int color =
        VertexColors.averageArgb(quad.color(0), quad.color(1), quad.color(2), quad.color(3));
    try {
      sink.accept(
          new ClientPlatform.ModelQuad(
              quad.toBakedQuad(sprite),
              quad.cullFace(),
              color,
              quad.emissive(),
              quad.renderLayer() == ChunkSectionLayer.TRANSLUCENT));
    } catch (IOException error) {
      throw new UncheckedIOException(error);
    }
  }
}
