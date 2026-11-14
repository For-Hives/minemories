package dev.minemories.client;

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
final class SableVolumes implements CaptureVolume.Source {
  private static final org.slf4j.Logger LOGGER = com.mojang.logging.LogUtils.getLogger();
  private static final String COMPANION = "dev.ryanhcode.sable.companion.SableCompanion";
  private static final String BOX = "dev.ryanhcode.sable.companion.math.BoundingBox3d";
  private static final String BOX_VIEW = "dev.ryanhcode.sable.companion.math.BoundingBox3dc";

  private record Api(
      Object companion, Method intersecting, Method containing, Constructor<?> box) {}

  private Api api;
  private boolean resolved, warned;

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
      unsupported(error);
      return List.of();
    }
    return volumes;
  }

  private static CaptureVolume volume(Api sable, Level level, Object subLevel)
      throws ReflectiveOperationException {
    Object pose = call(subLevel, "logicalPose");
    Object position = call(pose, "position");
    Object rotation = call(pose, "orientation");
    Object pivot = call(pose, "rotationPoint");
    Object scale = call(pose, "scale");
    Placement placement =
        new Placement(
            number(position, "x"),
            number(position, "y"),
            number(position, "z"),
            number(rotation, "x"),
            number(rotation, "y"),
            number(rotation, "z"),
            number(rotation, "w"),
            number(pivot, "x"),
            number(pivot, "y"),
            number(pivot, "z"),
            number(scale, "x"),
            number(scale, "y"),
            number(scale, "z"));
    CaptureBounds cells = plotCells(subLevel);
    if (cells == null) {
      Object drawn = call(subLevel, "boundingBox");
      cells =
          placement.localCells(
              number(drawn, "minX"),
              number(drawn, "minY"),
              number(drawn, "minZ"),
              number(drawn, "maxX"),
              number(drawn, "maxY"),
              number(drawn, "maxZ"));
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
      Object box = call(call(subLevel, "getPlot"), "getBoundingBox");
      int minX = (int) number(box, "minX"), maxX = (int) number(box, "maxX");
      int minY = (int) number(box, "minY"), maxY = (int) number(box, "maxY");
      int minZ = (int) number(box, "minZ"), maxZ = (int) number(box, "maxZ");
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
      unsupported(error);
      api = null;
    }
    return api;
  }

  private void unsupported(Throwable error) {
    if (warned) return;
    warned = true;
    LOGGER.warn("Sable sub-levels are not captured with this Sable version: {}", error.toString());
  }

  private static Object call(Object target, String method) throws ReflectiveOperationException {
    if (target == null) throw new NoSuchMethodException(method);
    return target.getClass().getMethod(method).invoke(target);
  }

  private static double number(Object target, String method) throws ReflectiveOperationException {
    Object value = call(target, method);
    if (!(value instanceof Number number)) throw new NoSuchMethodException(method);
    return number.doubleValue();
  }
}
