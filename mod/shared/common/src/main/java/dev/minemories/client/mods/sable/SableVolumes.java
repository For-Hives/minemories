package dev.minemories.client.mods.sable;

import dev.minemories.client.CaptureBounds;
import dev.minemories.client.util.Reflect;
import dev.minemories.client.util.WarnOnce;
import dev.minemories.client.volume.CaptureVolume;
import dev.minemories.client.volume.Placement;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.world.level.Level;

/**
 * Sable sub-levels (Create Aeronautics, Create Simulated, Offroad...): the blocks of a plane, a car
 * or a ship are stored in a plot grid about twenty million blocks away and drawn at the sub-level's
 * pose. Only Sable's public companion API is used, by name, so no Sable class is linked unless
 * Sable is there; the exact plot box comes from the sub-level when it exposes one.
 */
public final class SableVolumes implements CaptureVolume.Source {
  private static final org.slf4j.Logger LOGGER = com.mojang.logging.LogUtils.getLogger();
  private static final String COMPANION = "dev.ryanhcode.sable.companion.SableCompanion";
  private static final String BOX = "dev.ryanhcode.sable.companion.math.BoundingBox3d";
  private static final String BOX_VIEW = "dev.ryanhcode.sable.companion.math.BoundingBox3dc";

  private record Api(
      Object companion, Method intersecting, Method containing, Constructor<?> box) {}

  private Api api;
  private final WarnOnce unsupported =
      new WarnOnce(LOGGER, "Sable sub-levels are not captured with this Sable version");
  private boolean resolved;

  @Override
  public List<CaptureVolume> intersecting(Level level, CaptureBounds world) {
    Api sable = api();
    if (sable == null) return List.of();
    List<CaptureVolume> volumes = new ArrayList<>();
    try {
      Object query =
          sable.box.newInstance(
              (double) world.minX(),
              (double) world.minY(),
              (double) world.minZ(),
              world.maxX() + 1.0,
              world.maxY() + 1.0,
              world.maxZ() + 1.0);
      for (Object subLevel : (Iterable<?>) sable.intersecting.invoke(sable.companion, level, query))
        volumes.add(volume(sable, level, subLevel));
    } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
      unsupported.warn(error);
      return List.of();
    }
    return volumes;
  }

  private static CaptureVolume volume(Api sable, Level level, Object subLevel)
      throws ReflectiveOperationException {
    Object pose = Reflect.call(subLevel, "logicalPose");
    Object position = Reflect.call(pose, "position");
    Object rotation = Reflect.call(pose, "orientation");
    Object pivot = Reflect.call(pose, "rotationPoint");
    Object scale = Reflect.call(pose, "scale");
    Placement placement =
        new Placement(
            Reflect.number(position, "x"),
            Reflect.number(position, "y"),
            Reflect.number(position, "z"),
            Reflect.number(rotation, "x"),
            Reflect.number(rotation, "y"),
            Reflect.number(rotation, "z"),
            Reflect.number(rotation, "w"),
            Reflect.number(pivot, "x"),
            Reflect.number(pivot, "y"),
            Reflect.number(pivot, "z"),
            Reflect.number(scale, "x"),
            Reflect.number(scale, "y"),
            Reflect.number(scale, "z"));
    CaptureBounds cells = plotCells(subLevel);
    if (cells == null) {
      Object drawn = Reflect.call(subLevel, "boundingBox");
      cells =
          placement.localCells(
              Reflect.number(drawn, "minX"),
              Reflect.number(drawn, "minY"),
              Reflect.number(drawn, "minZ"),
              Reflect.number(drawn, "maxX"),
              Reflect.number(drawn, "maxY"),
              Reflect.number(drawn, "maxZ"));
    }
    int bottom = level.getMinBuildHeight(), top = level.getMaxBuildHeight() - 1;
    cells =
        new CaptureBounds(
            cells.minX(),
            Math.max(bottom, cells.minY()),
            cells.minZ(),
            cells.maxX(),
            Math.min(top, cells.maxY()),
            cells.maxZ());
    Map<Long, Boolean> owned = new HashMap<>();
    return new CaptureVolume(
        "sable",
        cells,
        placement,
        (chunkX, chunkZ) ->
            owned.computeIfAbsent(
                ((long) chunkX << 32) | (chunkZ & 0xffffffffL),
                key -> {
                  try {
                    return sable.containing.invoke(sable.companion, level, chunkX, chunkZ)
                        == subLevel;
                  } catch (ReflectiveOperationException error) {
                    return false;
                  }
                }));
  }

  /** The exact block box of the sub-level's plot, or null when this Sable does not expose it. */
  private static CaptureBounds plotCells(Object subLevel) {
    try {
      Object box = Reflect.call(Reflect.call(subLevel, "getPlot"), "getBoundingBox");
      int minX = (int) Reflect.number(box, "minX"), maxX = (int) Reflect.number(box, "maxX");
      int minY = (int) Reflect.number(box, "minY"), maxY = (int) Reflect.number(box, "maxY");
      int minZ = (int) Reflect.number(box, "minZ"), maxZ = (int) Reflect.number(box, "maxZ");
      // An empty plot reports a single cell at the world origin, which no plot ever covers.
      if (minX == 0 && maxX == 0 && minY == 0 && maxY == 0 && minZ == 0 && maxZ == 0) return null;
      if (minX > maxX || minY > maxY || minZ > maxZ) return null;
      return new CaptureBounds(minX, minY, minZ, maxX, maxY, maxZ);
    } catch (ReflectiveOperationException | RuntimeException error) {
      return null;
    }
  }

  private Api api() {
    if (resolved) return api;
    resolved = true;
    try {
      Class<?> companion = Class.forName(COMPANION);
      Object instance = companion.getField("INSTANCE").get(null);
      api =
          new Api(
              instance,
              companion.getMethod("getAllIntersecting", Level.class, Class.forName(BOX_VIEW)),
              companion.getMethod("getContaining", Level.class, int.class, int.class),
              Class.forName(BOX)
                  .getConstructor(
                      double.class,
                      double.class,
                      double.class,
                      double.class,
                      double.class,
                      double.class));
    } catch (ClassNotFoundException absent) {
      api = null;
    } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
      unsupported.warn(error);
      api = null;
    }
    return api;
  }
}
