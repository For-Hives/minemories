package dev.minemories.client.mods.create;

import com.mojang.blaze3d.vertex.PoseStack;
import java.lang.reflect.Method;
import java.util.Collection;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.block.BlockRenderDispatcher;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.world.level.block.RenderShape;
import net.minecraft.world.level.levelgen.structure.templatesystem.StructureTemplate;

/**
 * The simple way to draw a Create 0.5 contraption's assembled blocks (windmill sails, machines on a
 * bearing, pistons, pulleys, gantries, train carriages): block by block, each with the game's block
 * renderer, at the contraption's current pose. It needs almost nothing from Create, so {@link
 * CreateContraptions} falls back on it when {@link ContraptionStructure} does not know this Create;
 * it also answers whether a contraption's blocks are missing from its entity render at all.
 *
 * <p>Create is optional and its classes are not on the compile classpath: everything goes through
 * reflection on names that every Create version since 0.5 keeps ({@code AbstractContraptionEntity},
 * {@code getContraption}, {@code Contraption.getBlocks}, {@code applyLocalTransforms}). Anything
 * unexpected drops this contraption's blocks, never the capture.
 */
final class ContraptionBlocks {
  static final String ENTITY_CLASS = "AbstractContraptionEntity";
  static final String CREATE_PACKAGE = "com.simibubi.create.";

  /** Full sky and block light: the capture lights the scene itself. */
  private static final int FULL_BRIGHT = 0xF000F0;

  /**
   * Create 0.5's separate render pass for contraption blocks. Create 6 has none: its contraption
   * renderer draws the blocks itself once instancing is off during the capture, so drawing them
   * here too would double them.
   */
  static final String LAYER_PASS =
      "com.simibubi.create.content.contraptions.render.ContraptionRenderDispatcher";

  private static final Map<Class<?>, Method> METHODS = new ConcurrentHashMap<>();
  private static final Map<ClassLoader, Boolean> LAYER_PASSES = new ConcurrentHashMap<>();

  private ContraptionBlocks() {}

  /** True when the entity is a Create contraption, by its class hierarchy. */
  static boolean isContraption(Object entity) {
    for (Class<?> type = entity.getClass(); type != null; type = type.getSuperclass()) {
      if (type.getSimpleName().equals(ENTITY_CLASS) && type.getName().startsWith(CREATE_PACKAGE))
        return true;
    }
    return false;
  }

  /**
   * True when this contraption's blocks are missing from its entity render and must be drawn here:
   * a Create contraption from a Create that draws them in a pass of its own (0.5).
   */
  static boolean needsBlocks(Object entity) {
    if (!isContraption(entity)) return false;
    ClassLoader loader = entity.getClass().getClassLoader();
    return LAYER_PASSES.computeIfAbsent(loader, found -> exists(LAYER_PASS, found));
  }

  static boolean exists(String name, ClassLoader loader) {
    try {
      Class.forName(name, false, loader);
      return true;
    } catch (ClassNotFoundException | LinkageError missing) {
      return false;
    }
  }

  /**
   * The contraption's blocks, keyed by their position relative to its anchor, or null when this is
   * not a readable contraption.
   */
  static Collection<?> blocks(Object entity) {
    Object contraption = call(entity, "getContraption");
    if (contraption == null) return null;
    Object blocks = call(contraption, "getBlocks");
    return blocks instanceof Map<?, ?> map ? map.values() : null;
  }

  /**
   * Applies the contraption's own rotation (a turning windmill's angle, a bearing's axis) to {@code
   * pose}, as Create does before drawing it. False when the entity has no such method.
   */
  static boolean applyLocalTransforms(Object entity, Object pose, float partialTick) {
    Method method = METHODS.computeIfAbsent(entity.getClass(), ContraptionBlocks::findTransform);
    if (method == null) return false;
    try {
      method.invoke(entity, pose, partialTick);
      return true;
    } catch (ReflectiveOperationException | RuntimeException error) {
      return false;
    }
  }

  /**
   * Draws the contraption's blocks into {@code buffers}; {@code pose} already stands at the
   * entity's position relative to the capture centre. Returns how many blocks were drawn.
   */
  static int render(
      Object entity, PoseStack pose, MultiBufferSource buffers, BlockRenderDispatcher dispatcher) {
    Collection<?> blocks = blocks(entity);
    if (blocks == null || blocks.isEmpty()) return 0;
    pose.pushPose();
    try {
      if (!applyLocalTransforms(entity, pose, 1f)) return 0;
      int drawn = 0;
      for (Object value : blocks) {
        if (!(value instanceof StructureTemplate.StructureBlockInfo info)) continue;
        var state = info.state();
        if (state.isAir() || state.getRenderShape() == RenderShape.INVISIBLE) continue;
        var position = info.pos();
        pose.pushPose();
        pose.translate(position.getX(), position.getY(), position.getZ());
        dispatcher.renderSingleBlock(state, pose, buffers, FULL_BRIGHT, OverlayTexture.NO_OVERLAY);
        pose.popPose();
        drawn++;
      }
      return drawn;
    } finally {
      pose.popPose();
    }
  }

  private static Object call(Object target, String name) {
    for (Class<?> type = target.getClass(); type != null; type = type.getSuperclass()) {
      try {
        Method method = type.getDeclaredMethod(name);
        method.setAccessible(true);
        return method.invoke(target);
      } catch (NoSuchMethodException missing) {
        // Declared higher up the hierarchy.
      } catch (ReflectiveOperationException | RuntimeException error) {
        return null;
      }
    }
    return null;
  }

  /** {@code applyLocalTransforms(PoseStack, float)}, found by name and shape on any subclass. */
  private static Method findTransform(Class<?> entity) {
    for (Class<?> type = entity; type != null; type = type.getSuperclass()) {
      for (Method method : type.getDeclaredMethods()) {
        Class<?>[] parameters = method.getParameterTypes();
        if (method.getName().equals("applyLocalTransforms")
            && parameters.length == 2
            && parameters[1] == float.class
            && !java.lang.reflect.Modifier.isAbstract(method.getModifiers())) {
          method.setAccessible(true);
          return method;
        }
      }
    }
    return null;
  }

  /** For tests: forgets the methods found so far. */
  static void reset() {
    METHODS.clear();
    LAYER_PASSES.clear();
  }
}
