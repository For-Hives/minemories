package dev.minemories.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.QuadInstance;
import com.mojang.blaze3d.vertex.VertexConsumer;
import java.util.List;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.renderer.OrderedSubmitNodeCollector;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.block.MovingBlockRenderState;
import net.minecraft.client.renderer.block.dispatch.BlockStateModelPart;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderDispatcher;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.state.BlockEntityRenderState;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.gizmos.DrawableGizmoPrimitives;
import net.minecraft.client.renderer.item.ItemStackRenderState;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.client.renderer.state.level.QuadParticleRenderState;
import net.minecraft.client.renderer.texture.UvMapping;
import net.minecraft.client.resources.model.geometry.BakedQuad;
import net.minecraft.client.resources.model.geometry.ItemQuads;
import net.minecraft.core.Direction;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.VoxelShape;
import org.joml.Quaternionf;

/**
 * Renderers no longer draw into a buffer: they submit nodes (models, model parts, block models,
 * items, custom geometry) that the feature dispatcher uploads to the GPU. Entities and block
 * entities are extracted, and their submissions go to {@link Collector}, which draws each node into
 * the capture's own vertex consumers. Shadows, flames, leashes, text, particles, outlines and
 * gizmos are dispatcher features and are not part of the memory geometry.
 */
final class SubmitCapture {
  private SubmitCapture() {}

  static void entity(
      EntityRenderDispatcher dispatcher,
      Entity entity,
      PoseStack pose,
      RenderedModelCapture.Buffers buffers) {
    EntityRenderState state = dispatcher.extractEntity(entity, 1f);
    state.outlineColor = 0;
    submitEntity(dispatcher, state, pose, buffers);
  }

  private static <S extends EntityRenderState> void submitEntity(
      EntityRenderDispatcher dispatcher,
      S state,
      PoseStack pose,
      RenderedModelCapture.Buffers buffers) {
    EntityRenderer<?, ? super S> renderer = dispatcher.getRenderer(state);
    Vec3 offset = renderer.getRenderOffset(state);
    pose.pushPose();
    pose.translate(offset.x, offset.y, offset.z);
    renderer.submit(state, pose, new Collector(buffers), camera());
    pose.popPose();
  }

  static void blockEntity(
      BlockEntityRenderDispatcher dispatcher,
      BlockEntity blockEntity,
      PoseStack pose,
      RenderedModelCapture.Buffers buffers) {
    submitBlockEntity(dispatcher, blockEntity, pose, buffers);
  }

  private static <E extends BlockEntity, S extends BlockEntityRenderState>
      void submitBlockEntity(
          BlockEntityRenderDispatcher dispatcher,
          E blockEntity,
          PoseStack pose,
          RenderedModelCapture.Buffers buffers) {
    BlockEntityRenderer<E, S> renderer = dispatcher.getRenderer(blockEntity);
    if (renderer == null) return;
    Minecraft mc = Minecraft.getInstance();
    // tryExtractRenderState would also skip block entities beyond the camera's view distance.
    S state = renderer.createRenderState();
    renderer.extractRenderState(blockEntity, state, 1f, mc.gameRenderer.mainCamera().position(), null);
    renderer.submit(state, pose, new Collector(buffers), camera());
  }

  private static CameraRenderState camera() {
    var camera = Minecraft.getInstance().gameRenderer.mainCamera();
    CameraRenderState state = new CameraRenderState();
    state.pos = camera.position();
    state.blockPos = camera.blockPosition();
    state.orientation = new Quaternionf(camera.rotation());
    state.initialized = true;
    return state;
  }

  /** Draws every geometry node into the capture; every other node kind is dropped. */
  private static final class Collector implements SubmitNodeCollector {
    private final RenderedModelCapture.Buffers buffers;

    private Collector(RenderedModelCapture.Buffers buffers) {
      this.buffers = buffers;
    }

    @Override
    public OrderedSubmitNodeCollector order(int order) {
      return this;
    }

    @Override
    public <S> void submitModel(
        Model<? super S> model,
        S state,
        PoseStack pose,
        RenderType type,
        int light,
        int overlay,
        int color,
        UvMapping uvMapping,
        int outline) {
      model.setupAnim(state);
      VertexConsumer consumer = buffers.getBuffer(type);
      if (uvMapping != null) consumer = uvMapping.wrap(consumer);
      model.renderToBuffer(pose, consumer, light, overlay, color);
    }

    @Override
    public void submitModelPart(
        ModelPart part,
        PoseStack pose,
        RenderType type,
        int light,
        int overlay,
        UvMapping uvMapping,
        int color,
        int outline) {
      VertexConsumer consumer = buffers.getBuffer(type);
      if (uvMapping != null) consumer = uvMapping.wrap(consumer);
      part.render(pose, consumer, light, overlay, color);
    }

    @Override
    public void submitCustomGeometry(
        PoseStack pose, RenderType type, SubmitNodeCollector.CustomGeometryRenderer renderer) {
      renderer.render(pose.last(), buffers.getBuffer(type));
    }

    @Override
    public void submitBlockModel(
        PoseStack pose,
        RenderType type,
        List<BlockStateModelPart> parts,
        int[] tints,
        int light,
        int overlay,
        int outline) {
      VertexConsumer consumer = buffers.getBuffer(type);
      for (BlockStateModelPart part : parts) {
        for (Direction face : FACES) quads(pose, consumer, part.getQuads(face), tints, light, overlay);
      }
    }

    @Override
    public void submitItem(
        PoseStack pose,
        ItemDisplayContext context,
        int light,
        int overlay,
        int outline,
        int[] tints,
        ItemQuads quads,
        ItemStackRenderState.FoilType foil) {
      if (quads.isEmpty()) return;
      quads(pose, buffers.getBuffer(quads.solid().isEmpty() ? null : quadType(quads.solid())), quads.solid(), tints, light, overlay);
      quads(pose, buffers.getBuffer(quads.translucent().isEmpty() ? null : quadType(quads.translucent())), quads.translucent(), tints, light, overlay);
    }

    private static RenderType quadType(List<BakedQuad> quads) {
      return quads.get(0).materialInfo().itemRenderType();
    }

    private static void quads(
        PoseStack pose,
        VertexConsumer consumer,
        List<BakedQuad> quads,
        int[] tints,
        int light,
        int overlay) {
      QuadInstance instance = new QuadInstance();
      for (BakedQuad quad : quads) {
        int tint = quad.materialInfo().tintIndex();
        instance.setColor(tint >= 0 && tints != null && tint < tints.length ? tints[tint] : 0xFFFFFFFF);
        instance.setLightCoords(light);
        instance.setOverlayCoords(overlay);
        consumer.putBakedQuad(pose.last(), quad, instance);
      }
    }

    private static final Direction[] FACES = {
      null,
      Direction.DOWN,
      Direction.UP,
      Direction.NORTH,
      Direction.SOUTH,
      Direction.WEST,
      Direction.EAST
    };

    // Dispatcher features that are not geometry of the memory.
    @Override
    public void submitShadow(
        PoseStack pose, float radius, List<EntityRenderState.ShadowPiece> pieces) {}

    @Override
    public void submitNameTag(
        PoseStack pose,
        Vec3 offset,
        int y,
        net.minecraft.network.chat.Component text,
        boolean seeThrough,
        int light,
        CameraRenderState camera) {}

    @Override
    public void submitText(
        PoseStack pose,
        float x,
        float y,
        net.minecraft.util.FormattedCharSequence text,
        boolean dropShadow,
        net.minecraft.client.gui.Font.DisplayMode mode,
        int light,
        int color,
        int background,
        int outline) {}

    @Override
    public void submitTextBackground(
        PoseStack pose,
        float x,
        float y,
        float width,
        float height,
        int color,
        net.minecraft.client.gui.Font.DisplayMode mode,
        int light) {}

    @Override
    public void submitFlame(PoseStack pose, EntityRenderState state, Quaternionf rotation) {}

    @Override
    public void submitLeash(PoseStack pose, EntityRenderState.LeashState leash) {}

    @Override
    public <S> void submitCrumblingOverlay(
        Model<? super S> model,
        S state,
        PoseStack pose,
        RenderType type,
        int light,
        int overlay,
        int color,
        net.minecraft.client.renderer.feature.ModelFeatureRenderer.CrumblingOverlay crumbling) {}

    @Override
    public void submitMovingBlock(PoseStack pose, MovingBlockRenderState state, int outline) {}

    @Override
    public void submitBreakingBlockModel(
        PoseStack pose, List<BlockStateModelPart> parts, int progress, boolean flag) {}

    @Override
    public void submitShapeOutline(
        PoseStack pose, VoxelShape shape, RenderType type, int color, float width, boolean flag) {}

    @Override
    public void submitQuadParticleGroup(QuadParticleRenderState group) {}

    @Override
    public void submitGizmoPrimitives(
        DrawableGizmoPrimitives.Group group, CameraRenderState camera, boolean flag) {}
  }
}
