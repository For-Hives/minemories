package dev.minemories.client;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.OutlineBufferSource;
import net.minecraft.client.renderer.SubmitNodeStorage;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderDispatcher;
import net.minecraft.client.renderer.blockentity.BlockEntityRenderer;
import net.minecraft.client.renderer.blockentity.state.BlockEntityRenderState;
import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.feature.FeatureRenderDispatcher;
import net.minecraft.client.renderer.state.CameraRenderState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.phys.Vec3;
import org.joml.Quaternionf;

/**
 * Since 1.21.5 renderers no longer draw into a buffer: they submit nodes that a feature dispatcher
 * turns into vertices. Entities and block entities are extracted, submitted to a private storage
 * and flushed into the capture's own buffer source. Shadows, flames and outlines are dispatcher
 * features and are not part of the souvenir geometry.
 */
final class SubmitCapture {
  // Only ever drawn into when an outline colour is set, which extraction clears.
  private static OutlineBufferSource outline;

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
    SubmitNodeStorage storage = new SubmitNodeStorage();
    pose.pushPose();
    pose.translate(offset.x, offset.y, offset.z);
    renderer.submit(state, pose, storage, camera());
    pose.popPose();
    flush(storage, buffers);
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
    renderer.extractRenderState(
        blockEntity, state, 1f, mc.gameRenderer.getMainCamera().position(), null);
    SubmitNodeStorage storage = new SubmitNodeStorage();
    renderer.submit(state, pose, storage, camera());
    flush(storage, buffers);
  }

  private static void flush(SubmitNodeStorage storage, RenderedModelCapture.Buffers buffers) {
    Minecraft mc = Minecraft.getInstance();
    var source = buffers.source();
    try (var features =
        new FeatureRenderDispatcher(
            storage,
            mc.getBlockRenderer(),
            source,
            mc.getAtlasManager(),
            outline(),
            source,
            mc.font)) {
      features.renderAllFeatures();
    }
  }

  private static OutlineBufferSource outline() {
    if (outline == null) outline = new OutlineBufferSource();
    return outline;
  }

  private static CameraRenderState camera() {
    var camera = Minecraft.getInstance().gameRenderer.getMainCamera();
    CameraRenderState state = new CameraRenderState();
    state.pos = camera.position();
    state.blockPos = camera.blockPosition();
    state.orientation = new Quaternionf(camera.rotation());
    state.entityPos = camera.entity() == null ? state.pos : camera.entity().position();
    state.initialized = true;
    return state;
  }
}
