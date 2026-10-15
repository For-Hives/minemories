package dev.minemories.neoforge;

import java.lang.reflect.Method;
import net.minecraft.world.level.LevelAccessor;

/** Optional integration: a changed Flywheel API must fail capture rather than omit GPU models. */
final class FlywheelCaptureBridge {
  private record Probe(boolean present, Method supports) {}

  private static final Probe FLYWHEEL = find();

  private FlywheelCaptureBridge() {}

  private static Probe find() {
    try {
      Class<?> api =
          Class.forName("dev.engine_room.flywheel.api.visualization.VisualizationManager");
      try {
        return new Probe(true, api.getMethod("supportsVisualization", LevelAccessor.class));
      } catch (NoSuchMethodException error) {
        return new Probe(true, null);
      }
    } catch (ClassNotFoundException error) {
      return new Probe(false, null);
    }
  }

  static void verify(LevelAccessor level) {
    if (!FLYWHEEL.present()) return;
    if (FLYWHEEL.supports() == null)
      throw new IllegalStateException("Cette version de Flywheel ne permet pas la capture CPU.");
    try {
      if (Boolean.TRUE.equals(FLYWHEEL.supports().invoke(null, level)))
        throw new IllegalStateException(
            "Le renderer Flywheel ne fournit pas son modèle CPU pendant la capture.");
    } catch (ReflectiveOperationException error) {
      throw new IllegalStateException("Le renderer Flywheel ne peut pas être capturé.", error);
    }
  }
}
