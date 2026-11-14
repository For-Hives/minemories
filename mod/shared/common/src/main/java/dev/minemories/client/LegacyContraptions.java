package dev.minemories.client;

import com.mojang.blaze3d.vertex.PoseStack;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.function.Function;

/**
 * Optional integration: the blocks of Create 0.5.1 contraptions (Minecraft 1.18.2 to 1.20.1).
 *
 * <p>Create 0.5.1 does not draw a contraption's blocks from its entity renderer. The renderer only
 * draws the block entities and actors, with matrices that {@code ContraptionRenderDispatcher} set
 * up from the camera during the level's layer pass; the blocks themselves are a {@code
 * SuperByteBuffer} per chunk layer drawn by that same pass, which the capture never reaches. So a
 * bearing, a piston, a minecart contraption or a train carriage came out of a capture without its
 * body.
 *
 * <p>While one contraption entity is collected, its render info's matrices are set to the capture
 * pose instead of the camera (so the entity renderer puts block entities, actors and bogeys where
 * the capture expects them), then each chunk layer's structure buffer is built on the CPU and drawn
 * into the capture with the same matrices. The render info is left cleared, so the next frame sets
 * it up from the camera again.
 *
 * <p>Create 6 draws its contraptions from the entity renderer and has none of these classes. A
 * Create 0.5.1 whose API no longer matches is logged once and its contraptions keep what the entity
 * renderer draws: the rest of the capture is not lost for it.
 */
final class LegacyContraptions {
  private static final org.slf4j.Logger LOGGER = com.mojang.logging.LogUtils.getLogger();

  /** Where the classes live in Create 0.5.1 and the Flywheel 0.6 it bundles. */
  record Names(
      String entity,
      String dispatcher,
      String renderingWorld,
      String renderInfo,
      String matrices,
      String structureBuffer,
      String flywheelWorld) {
    static final Names CREATE_0_5_1 =
        new Names(
            "com.simibubi.create.content.contraptions.AbstractContraptionEntity",
            "com.simibubi.create.content.contraptions.render.ContraptionRenderDispatcher",
            "com.simibubi.create.content.contraptions.render.ContraptionRenderingWorld",
            "com.simibubi.create.content.contraptions.render.ContraptionRenderInfo",
            "com.simibubi.create.content.contraptions.render.ContraptionMatrices",
            "com.simibubi.create.foundation.render.SuperByteBuffer",
            "com.jozufozu.flywheel.core.virtual.VirtualRenderWorld");
  }

  /** The Create 0.5.1 calls a capture needs, found once. */
  record Api(
      Class<?> entity,
      Method contraption,
      Method aliveOrStale,
      Method readyForRender,
      Method localTransforms,
      Field worlds,
      Method worldOf,
      Method renderInfo,
      Field renderWorld,
      Method matrices,
      Method clear,
      Field ready,
      Method viewProjection,
      Method modelViewProjection,
      Method model,
      Method canInstance,
      Method buildStructure,
      Method empty,
      Method transform,
      Method renderInto,
      Method delete) {

    /**
     * Returns null when Create 0.5.1 is absent (no Create, or Create 6 and Flywheel 1.0), and
     * throws when it is present but its API is not the one this code knows.
     */
    static Api find(Names names) throws ReflectiveOperationException {
      Class<?> entity;
      try {
        entity = Class.forName(names.entity());
        Class.forName(names.flywheelWorld());
      } catch (ClassNotFoundException absent) {
        return null;
      }
      Class<?> dispatcher = Class.forName(names.dispatcher());
      Class<?> renderingWorld = Class.forName(names.renderingWorld());
      Class<?> info = Class.forName(names.renderInfo());
      Class<?> matrices = Class.forName(names.matrices());
      Class<?> buffer = Class.forName(names.structureBuffer());
      Field worlds = dispatcher.getDeclaredField("WORLDS");
      worlds.setAccessible(true);
      Field ready = matrices.getDeclaredField("ready");
      ready.setAccessible(true);
      return new Api(
          entity,
          method(entity, "getContraption", 0),
          method(entity, "isAliveOrStale", 0),
          method(entity, "isReadyForRender", 0),
          method(entity, "applyLocalTransforms", 2),
          worlds,
          method(worlds.getType(), "get", 1),
          method(renderingWorld, "getRenderInfo", 1),
          info.getField("renderWorld"),
          method(info, "getMatrices", 0),
          method(matrices, "clear", 0),
          ready,
          method(matrices, "getViewProjection", 0),
          method(matrices, "getModelViewProjection", 0),
          method(matrices, "getModel", 0),
          method(dispatcher, "canInstance", 0),
          method(dispatcher, "buildStructureBuffer", 3),
          method(buffer, "isEmpty", 0),
          method(buffer, "transform", 1),
          method(buffer, "renderInto", 2),
          method(buffer, "delete", 0));
    }

    /** The one public, non-bridge method of that name and arity. */
    static Method method(Class<?> owner, String name, int parameters) throws NoSuchMethodException {
      Method found = null;
      for (Method candidate : owner.getMethods()) {
        if (!candidate.getName().equals(name)
            || candidate.getParameterCount() != parameters
            || candidate.isBridge()
            || candidate.isSynthetic()) continue;
        if (found != null)
          throw new NoSuchMethodException(owner.getName() + "." + name + " is ambiguous");
        found = candidate;
      }
      if (found == null) throw new NoSuchMethodException(owner.getName() + "." + name);
      return found;
    }
  }

  /** One contraption entity being collected; {@link #NONE} for any other entity. */
  interface Drawing {
    /**
     * Draws the contraption's blocks, one call per chunk layer, then gives the render info back to
     * the camera.
     *
     * @param layers the chunk render layers ({@code RenderType.chunkBufferLayers()})
     * @param buffers the capture's vertex consumer for one of those layers
     */
    void finish(Iterable<?> layers, Function<Object, Object> buffers);
  }

  static final Drawing NONE = (layers, buffers) -> {};

  private static final Object UNBOUND = new Object();
  private static Object api = UNBOUND;
  private static boolean warned;

  private LegacyContraptions() {}

  /**
   * Call before the entity renderer, inside {@link CaptureRenderScope}, with the translation of its
   * pose (the capture pose only translates). Returns {@link #NONE} for anything that is not a
   * Create 0.5.1 contraption.
   */
  static Drawing prepare(Object entity, Object level, double x, double y, double z) {
    Api bound = api();
    if (bound == null || !bound.entity().isInstance(entity)) return NONE;
    try {
      return prepare(bound, entity, level, x, y, z);
    } catch (ReflectiveOperationException | RuntimeException error) {
      warn(error);
      return NONE;
    }
  }

  static Drawing prepare(Api api, Object entity, Object level, double x, double y, double z)
      throws ReflectiveOperationException {
    Object contraption = api.contraption().invoke(entity);
    if (contraption == null) return NONE;
    Object worlds = api.worldOf().invoke(api.worlds().get(null), level);
    Object info = api.renderInfo().invoke(worlds, contraption);
    Object matrices = api.matrices().invoke(info);
    Object renderWorld = api.renderWorld().get(info);
    if (Boolean.TRUE.equals(api.canInstance().invoke(null)))
      warn(new IllegalStateException("Flywheel still draws contraption parts during the capture"));
    boolean visible =
        Boolean.TRUE.equals(api.aliveOrStale().invoke(entity))
            && Boolean.TRUE.equals(api.readyForRender().invoke(entity));
    Drawing drawing =
        (layers, buffers) -> {
          try {
            if (visible) drawStructure(api, renderWorld, contraption, matrices, layers, buffers);
          } catch (ReflectiveOperationException | RuntimeException error) {
            warn(error);
          } finally {
            release(api, matrices);
          }
        };
    api.clear().invoke(matrices);
    try {
      // ContraptionMatrices.setup with the capture pose instead of the camera, at the latest tick
      // like every other entity. The world and light matrices only place lighting: left identity.
      ((PoseStack) api.viewProjection().invoke(matrices)).translate(x, y, z);
      PoseStack modelViewProjection = (PoseStack) api.modelViewProjection().invoke(matrices);
      modelViewProjection.translate(x, y, z);
      api.localTransforms().invoke(entity, modelViewProjection, 1f);
      api.localTransforms().invoke(entity, api.model().invoke(matrices), 1f);
      api.ready().setBoolean(matrices, true);
    } catch (ReflectiveOperationException | RuntimeException error) {
      release(api, matrices);
      throw error;
    }
    return drawing;
  }

  /** Leaves the render info cleared: the next frame sets it up from the camera again. */
  private static void release(Api api, Object matrices) {
    try {
      api.clear().invoke(matrices);
    } catch (ReflectiveOperationException | RuntimeException error) {
      warn(error);
    }
  }

  private static void drawStructure(
      Api api,
      Object renderWorld,
      Object contraption,
      Object matrices,
      Iterable<?> layers,
      Function<Object, Object> buffers)
      throws ReflectiveOperationException {
    Object model = api.model().invoke(matrices);
    Object viewProjection = api.viewProjection().invoke(matrices);
    for (Object layer : layers) {
      Object structure = api.buildStructure().invoke(null, renderWorld, contraption, layer);
      try {
        if (Boolean.TRUE.equals(api.empty().invoke(structure))) continue;
        api.transform().invoke(structure, model);
        api.renderInto().invoke(structure, viewProjection, buffers.apply(layer));
      } finally {
        api.delete().invoke(structure);
      }
    }
  }

  private static synchronized Api api() {
    if (api == UNBOUND) {
      try {
        api = Api.find(Names.CREATE_0_5_1);
      } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
        api = null;
        warn(error);
      }
    }
    return (Api) api;
  }

  private static synchronized void warn(Throwable error) {
    if (warned) return;
    warned = true;
    LOGGER.warn(
        "Create contraptions are not fully captured with this Create version: {}",
        error.toString());
  }

  /** Tests only: forget the bound API and the logged warning. */
  static synchronized void reset() {
    api = UNBOUND;
    warned = false;
  }
}
