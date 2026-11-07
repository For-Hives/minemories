package dev.minemories.fabric;

import dev.minemories.client.ClientPlatform;
import dev.minemories.client.VertexColors;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.renderer.v1.RendererAccess;
import net.fabricmc.fabric.api.renderer.v1.material.BlendMode;
import net.fabricmc.fabric.api.renderer.v1.material.RenderMaterial;
import net.fabricmc.fabric.api.renderer.v1.mesh.MeshBuilder;
import net.fabricmc.fabric.api.renderer.v1.mesh.QuadEmitter;
import net.fabricmc.fabric.api.renderer.v1.mesh.QuadView;
import net.fabricmc.fabric.api.renderer.v1.model.FabricBakedModel;
import net.fabricmc.fabric.api.renderer.v1.model.SpriteFinder;
import net.fabricmc.fabric.api.renderer.v1.render.RenderContext;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.renderer.texture.TextureAtlas;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.core.Direction;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.block.state.BlockState;

/** A model can emit meshes or transformed fallback models; retain only one emitted quad. */
final class FabricModelCapture implements RenderContext {
  private static final int MAX_QUADS = 4096;
  private final Minecraft minecraft;
  private final ClientPlatform.ModelRequest request;
  private final BlockState state;
  private final Predicate<Direction> visible;
  private final ClientPlatform.QuadSink sink;
  private final MeshBuilder builder;
  private final CaptureQuadEmitter emitter;
  private final SpriteFinder sprites;
  private final RenderMaterial standard;
  private final Deque<QuadTransform> transforms = new ArrayDeque<>();
  private int emitted;

  FabricModelCapture(
      Minecraft minecraft,
      BlockState state,
      ClientPlatform.ModelRequest request,
      Predicate<Direction> visible,
      ClientPlatform.QuadSink sink)
      throws IOException {
    this.minecraft = minecraft;
    this.state = state;
    this.request = request;
    this.visible = visible;
    this.sink = sink;
    var renderer = RendererAccess.INSTANCE.getRenderer();
    if (renderer == null) throw new IOException("Fabric renderer unavailable for this model.");
    builder = renderer.meshBuilder();
    emitter = new CaptureQuadEmitter(builder.getEmitter(), this::emit);
    standard = renderer.materialById(RenderMaterial.MATERIAL_STANDARD);
    sprites = SpriteFinder.get(minecraft.getModelManager().getAtlas(TextureAtlas.LOCATION_BLOCKS));
  }

  void capture(FabricBakedModel model) throws IOException {
    try {
      model.emitBlockQuads(
          minecraft.level, state, request.pos(), () -> RandomSource.create(request.seed()), this);
    } catch (UncheckedIOException error) {
      throw error.getCause();
    }
  }

  private void emit(QuadEmitter quad) {
    if (++emitted > MAX_QUADS)
      throw new UncheckedIOException(new IOException("Too many primitives in this Fabric model."));
    boolean keep = true;
    for (var transform : transforms) {
      if (!transform.transform(quad)) {
        keep = false;
        break;
      }
    }
    keep &= visible.test(quad.cullFace());
    quad.emit();
    var mesh = builder.build();
    emitter.replace(builder.getEmitter());
    if (keep) mesh.forEach(this::accept);
  }

  private void accept(QuadView quad) {
    for (int i = 0; i < 4; i++)
      if (!(Float.isFinite(quad.x(i))
          && Float.isFinite(quad.y(i))
          && Float.isFinite(quad.z(i))
          && Float.isFinite(quad.spriteU(i, 0))
          && Float.isFinite(quad.spriteV(i, 0)))) return;
    var sprite = sprites.find(quad, 0);
    for (int i = 0; i < 4; i++)
      if (quad.spriteU(i, 0) < sprite.getU0() - .000001f
          || quad.spriteU(i, 0) > sprite.getU1() + .000001f
          || quad.spriteV(i, 0) < sprite.getV0() - .000001f
          || quad.spriteV(i, 0) > sprite.getV1() + .000001f)
        throw new UncheckedIOException(
            new IOException("Fabric UVs span several sprites."));
    var baked = quad.toBakedQuad(0, sprite, false);
    var material = quad.material();
    if (MaterialFlags.disableColorIndex(material))
      baked = new BakedQuad(baked.getVertices(), -1, baked.getDirection(), sprite, baked.isShade());
    int color =
        VertexColors.averageArgb(quad.spriteColor(0, 0), quad.spriteColor(1, 0), quad.spriteColor(2, 0), quad.spriteColor(3, 0));
    try {
      sink.accept(
          new ClientPlatform.ModelQuad(
              baked,
              quad.cullFace(),
              color,
              MaterialFlags.emissive(material),
              MaterialFlags.blendMode(material) == BlendMode.TRANSLUCENT));
    } catch (IOException error) {
      throw new UncheckedIOException(error);
    }
  }

  // RenderContext intentionally exposes its mutable emitter; every emitted quad is bounded/copied.
  @edu.umd.cs.findbugs.annotations.SuppressFBWarnings(
      value = "EI_EXPOSE_REP",
      justification =
          "Fabric RenderContext requires the shared mutable emitter for fluent model writes")
  @Override
  public QuadEmitter getEmitter() {
    return emitter;
  }

  @Override
  public java.util.function.Consumer<net.fabricmc.fabric.api.renderer.v1.mesh.Mesh> meshConsumer() {
    // Indigo's Mesh.outputTo casts its target to an internal emitter implementation.
    // Enumerate provider-owned quads instead so our bounded emitter still applies transforms.
    return mesh -> mesh.forEach(
            quad -> {
              quad.copyTo(emitter.raw());
              emitter.emit();
            });
  }

  @Override
  public void pushTransform(QuadTransform transform) {
    if (transforms.size() >= 64) throw new IllegalStateException("Too many Fabric transforms.");
    transforms.push(transform);
  }

  @Override
  public void popTransform() {
    transforms.pop();
  }

  @Override
  public BakedModelConsumer bakedModelConsumer() {
    return new BakedModelConsumer() {
      @Override
      public void accept(BakedModel model) {
        accept(model, state);
      }

      @Override
      public void accept(BakedModel model, BlockState state) {
        for (Direction face : Direction.values()) fallback(model, state, face);
        fallback(model, state, null);
      }
    };
  }

  private void fallback(BakedModel model, BlockState state, Direction face) {
    for (var quad : model.getQuads(state, face, RandomSource.create(request.seed())))
      emitter.fromVanilla(quad, standard, face).emit();
  }
}
