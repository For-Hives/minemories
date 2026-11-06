package dev.minemories.fabric;

import java.lang.reflect.Method;
import net.fabricmc.fabric.api.renderer.v1.material.BlendMode;
import net.fabricmc.fabric.api.renderer.v1.material.RenderMaterial;

/**
 * The Fabric renderer API of Minecraft 1.19.2 does not expose a material's flags, only its
 * implementation does. Indigo's materials answer {@code blendMode(int)}, {@code emissive(int)} and
 * {@code disableColorIndex(int)}; any other renderer, or a failure, reads as the defaults.
 */
final class MaterialFlags {
  private MaterialFlags() {}

  static BlendMode blendMode(RenderMaterial material) {
    return call(material, "blendMode") instanceof BlendMode mode ? mode : BlendMode.DEFAULT;
  }

  static boolean emissive(RenderMaterial material) {
    return Boolean.TRUE.equals(call(material, "emissive"));
  }

  static boolean disableColorIndex(RenderMaterial material) {
    return Boolean.TRUE.equals(call(material, "disableColorIndex"));
  }

  private static Object call(RenderMaterial material, String name) {
    try {
      Method method = material.getClass().getMethod(name, int.class);
      method.setAccessible(true);
      return method.invoke(material, 0);
    } catch (ReflectiveOperationException | RuntimeException absent) {
      return null;
    }
  }
}
