package dev.minemories.client.mods;

import dev.minemories.client.CaptureBounds;
import dev.minemories.client.mods.sable.SableVolumes;
import dev.minemories.client.mods.valkyrien.ValkyrienVolumes;
import dev.minemories.client.volume.CaptureVolume;
import java.util.List;
import net.minecraft.world.level.Level;

/**
 * Every mod that stores blocks away from where it draws them (physics ships, planes, cars), in a
 * fixed order. Add one line for a new one; its class goes in a package of its own next to these.
 */
public final class ModVolumes {
  private static final List<CaptureVolume.Source> SOURCES =
      List.of(new SableVolumes(), new ValkyrienVolumes());

  private ModVolumes() {}

  /** The volumes drawn inside the capture box, within the per-capture limits. */
  public static List<CaptureVolume> around(Level level, CaptureBounds world) {
    return CaptureVolume.around(SOURCES, level, world);
  }
}
