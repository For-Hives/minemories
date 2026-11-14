package dev.minemories.client.mods.valkyrien;

import dev.minemories.client.CaptureBounds;
import dev.minemories.client.util.Reflect;
import dev.minemories.client.util.WarnOnce;
import dev.minemories.client.volume.CaptureVolume;
import dev.minemories.client.volume.Placement;
import java.lang.reflect.Method;
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
public final class ValkyrienVolumes implements CaptureVolume.Source {
  private static final org.slf4j.Logger LOGGER = com.mojang.logging.LogUtils.getLogger();
  private static final String UTILS = "org.valkyrienskies.mod.common.VSGameUtilsKt";

  private Method intersecting;
  private final WarnOnce unsupported =
      new WarnOnce(
          LOGGER, "Valkyrien Skies ships are not captured with this Valkyrien Skies version");
  private boolean resolved;

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
      unsupported.warn(error);
      return List.of();
    }
    return volumes;
  }

  private static CaptureVolume volume(Level level, Object ship)
      throws ReflectiveOperationException {
    Placement placement = placement(Reflect.call(ship, "getTransform"));
    CaptureBounds cells = shipyardCells(Reflect.call(ship, "getShipAABB"));
    if (cells == null) {
      Object drawn = Reflect.call(ship, "getWorldAABB");
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
    Object claim = Reflect.call(ship, "getChunkClaim");
    Method contains = Reflect.method(claim, "contains", int.class, int.class);
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
    Object position = Reflect.call(transform, "getPositionInWorld");
    Object pivot = Reflect.call(transform, "getPositionInModel", "getPositionInShip");
    Object rotation = Reflect.call(transform, "getRotation", "getShipToWorldRotation");
    Object scale = Reflect.call(transform, "getScaling", "getShipToWorldScaling");
    return new Placement(
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
  }

  /**
   * The block box of the ship in its shipyard (VS2's {@code AABBic}, read with an inclusive maximum
   * so an exclusive one only adds a layer of air), or null when the ship has no blocks yet.
   */
  static CaptureBounds shipyardCells(Object box) throws ReflectiveOperationException {
    if (box == null) return null;
    int minX = (int) Reflect.number(box, "minX"), maxX = (int) Reflect.number(box, "maxX");
    int minY = (int) Reflect.number(box, "minY"), maxY = (int) Reflect.number(box, "maxY");
    int minZ = (int) Reflect.number(box, "minZ"), maxZ = (int) Reflect.number(box, "maxZ");
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
      unsupported.warn(error);
      intersecting = null;
    }
    return intersecting;
  }
}
