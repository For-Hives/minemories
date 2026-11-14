package dev.minemories.client;

import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;

/**
 * Valkyrien Skies 2 ships (Eureka, Clockwork, Trackwork...): the blocks of a ship are stored in a
 * "shipyard" chunk claim millions of blocks away and drawn with the ship's ship-to-world transform.
 * Only VS2's public API is used, by name, so no VS2 class is linked unless VS2 is there.
 */
final class ValkyrienVolumes implements CaptureVolume.Source {
  private static final org.slf4j.Logger LOGGER = com.mojang.logging.LogUtils.getLogger();
  private static final String UTILS = "org.valkyrienskies.mod.common.VSGameUtilsKt";

  private Method intersecting;
  private boolean resolved, warned;

  @Override
  public List<CaptureVolume> intersecting(Level level, CaptureBounds world) {
    Method ships = api();
    if (ships == null) return List.of();
    List<CaptureVolume> volumes = new ArrayList<>();
    try {
      AABB query =
          new AABB(
              world.minX(),
              world.minY(),
              world.minZ(),
              world.maxX() + 1.0,
              world.maxY() + 1.0,
              world.maxZ() + 1.0);
      for (Object ship : (Iterable<?>) ships.invoke(null, level, query))
        volumes.add(volume(level, ship));
    } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
      unsupported(error);
      return List.of();
    }
    return volumes;
  }

  private static CaptureVolume volume(Level level, Object ship)
      throws ReflectiveOperationException {
    Placement placement = placement(call(ship, "getTransform"));
    CaptureBounds cells = shipyardCells(call(ship, "getShipAABB"));
    if (cells == null) {
      Object drawn = call(ship, "getWorldAABB");
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
    Object claim = call(ship, "getChunkClaim");
    Method contains = method(claim, "contains", int.class, int.class);
    Map<Long, Boolean> owned = new HashMap<>();
    return new CaptureVolume(
        "valkyrienskies",
        cells,
        placement,
        (chunkX, chunkZ) ->
            owned.computeIfAbsent(
                ((long) chunkX << 32) | (chunkZ & 0xffffffffL),
                key -> {
                  try {
                    return Boolean.TRUE.equals(contains.invoke(claim, chunkX, chunkZ));
                  } catch (ReflectiveOperationException error) {
                    return false;
                  }
                }));
  }

  /**
   * A VS2 {@code ShipTransform} as a {@link Placement}. VS2 builds its ship-to-world matrix as
   * {@code translate(positionInWorld) · rotate(rotation) · scale(scaling) ·
   * translate(−positionInShip)}, which is the placement's convention with the position in the ship
   * as pivot. Newer VS cores renamed the getters; both spellings are read.
   */
  static Placement placement(Object transform) throws ReflectiveOperationException {
    Object position = call(transform, "getPositionInWorld");
    Object pivot = call(transform, "getPositionInModel", "getPositionInShip");
    Object rotation = call(transform, "getRotation", "getShipToWorldRotation");
    Object scale = call(transform, "getScaling", "getShipToWorldScaling");
    return new Placement(
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
  }

  /**
   * The block box of the ship in its shipyard (VS2's {@code AABBic}, read with an inclusive maximum
   * so an exclusive one only adds a layer of air), or null when the ship has no blocks yet.
   */
  static CaptureBounds shipyardCells(Object box) throws ReflectiveOperationException {
    if (box == null) return null;
    int minX = (int) number(box, "minX"), maxX = (int) number(box, "maxX");
    int minY = (int) number(box, "minY"), maxY = (int) number(box, "maxY");
    int minZ = (int) number(box, "minZ"), maxZ = (int) number(box, "maxZ");
    if (minX > maxX || minY > maxY || minZ > maxZ) return null;
    return new CaptureBounds(minX, minY, minZ, maxX, maxY, maxZ);
  }

  private Method api() {
    if (resolved) return intersecting;
    resolved = true;
    try {
      intersecting =
          Class.forName(UTILS).getMethod("getShipsIntersecting", Level.class, AABB.class);
    } catch (ClassNotFoundException absent) {
      intersecting = null;
    } catch (ReflectiveOperationException | RuntimeException | LinkageError error) {
      unsupported(error);
      intersecting = null;
    }
    return intersecting;
  }

  private void unsupported(Throwable error) {
    if (warned) return;
    warned = true;
    LOGGER.warn(
        "Valkyrien Skies ships are not captured with this Valkyrien Skies version: {}",
        error.toString());
  }

  /** The first of {@code names} the target answers, called with no argument. */
  private static Object call(Object target, String... names) throws ReflectiveOperationException {
    if (target == null) throw new NoSuchMethodException(names[0]);
    NoSuchMethodException missing = null;
    for (String name : names) {
      try {
        return method(target, name).invoke(target);
      } catch (NoSuchMethodException error) {
        missing = error;
      }
    }
    throw missing;
  }

  private static double number(Object target, String method) throws ReflectiveOperationException {
    Object value = call(target, method);
    if (!(value instanceof Number number)) throw new NoSuchMethodException(method);
    return number.doubleValue();
  }

  /**
   * The public declaration of a method: VS2's implementation classes are not always public, and
   * reflection may only call them through the public interface they implement.
   */
  static Method method(Object target, String name, Class<?>... parameters)
      throws NoSuchMethodException {
    Method found = publicMethod(target.getClass(), name, parameters);
    if (found == null) throw new NoSuchMethodException(name);
    return found;
  }

  private static Method publicMethod(Class<?> type, String name, Class<?>... parameters) {
    if (type == null) return null;
    if (Modifier.isPublic(type.getModifiers())) {
      try {
        return type.getMethod(name, parameters);
      } catch (NoSuchMethodException absent) {
        return null;
      }
    }
    for (Class<?> contract : type.getInterfaces()) {
      Method found = publicMethod(contract, name, parameters);
      if (found != null) return found;
    }
    return publicMethod(type.getSuperclass(), name, parameters);
  }
}
