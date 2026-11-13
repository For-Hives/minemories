package dev.minemories.client;

import java.lang.reflect.Method;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;

/**
 * Optional integration: a changed Flywheel API must fail capture rather than omit GPU models.
 *
 * <p>Two Flywheel generations ship with Create. Flywheel 1.0 (Create 6) asks {@code
 * VisualizationManager.supportsVisualization}; Flywheel 0.6 (Create 0.5.1 on Minecraft 1.18.2 to
 * 1.20.1) asks {@code Backend.canUseInstancing}, and Create's renderers (tracks, shafts, cogs,
 * belts, presses, bogeys...) return without drawing when it answers true. The loader adapters'
 * mixins answer false inside {@link CaptureRenderScope}; this probe checks they did.
 */
final class FlywheelCaptureBridge {
  /** One Flywheel generation and its static "the GPU draws this level" switch. */
  record Probe(String name, boolean present, Method gpuDraws) {
    static Probe find(String name, String className, String method, Class<?> parameter) {
      try {
        Class<?> api = Class.forName(className);
        try {
          return new Probe(name, true, api.getMethod(method, parameter));
        } catch (NoSuchMethodException error) {
          return new Probe(name, true, null);
        }
      } catch (ClassNotFoundException error) {
        return new Probe(name, false, null);
      }
    }

    void verify(Object level) {
      if (!present) return;
      if (gpuDraws == null)
        throw new IllegalStateException("This " + name + " version does not support CPU capture.");
      boolean gpu;
      try {
        gpu = Boolean.TRUE.equals(gpuDraws.invoke(null, level));
      } catch (ReflectiveOperationException error) {
        throw new IllegalStateException("The " + name + " renderer cannot be captured.", error);
      }
      if (gpu)
        throw new IllegalStateException(
            "The " + name + " renderer does not expose its CPU model during the capture.");
    }
  }

  private static final Probe FLYWHEEL =
      Probe.find(
          "Flywheel",
          "dev.engine_room.flywheel.api.visualization.VisualizationManager",
          "supportsVisualization",
          LevelAccessor.class);
  private static final Probe FLYWHEEL_0_6 =
      Probe.find(
          "Flywheel 0.6", "com.jozufozu.flywheel.backend.Backend", "canUseInstancing", Level.class);

  private FlywheelCaptureBridge() {}

  static void verify(LevelAccessor level) {
    FLYWHEEL.verify(level);
    FLYWHEEL_0_6.verify(level instanceof Level world ? world : null);
  }
}
