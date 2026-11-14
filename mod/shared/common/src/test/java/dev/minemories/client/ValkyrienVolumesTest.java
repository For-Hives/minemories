package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import org.joml.Matrix4d;
import org.joml.Quaterniond;
import org.joml.Quaterniondc;
import org.joml.Vector3d;
import org.joml.Vector3dc;
import org.junit.jupiter.api.Test;

class ValkyrienVolumesTest {
  /** VS2 shipyards sit around 28 million blocks from the origin. */
  private static final double YARD = 28_672_000;

  /** The getters of VS cores up to 1.1. */
  public interface LegacyTransform {
    Vector3dc getPositionInWorld();

    Vector3dc getPositionInShip();

    Quaterniondc getShipToWorldRotation();

    Vector3dc getShipToWorldScaling();
  }

  /** The getters of newer VS cores, behind a class reflection may not call directly. */
  public interface Transform {
    Vector3dc getPositionInWorld();

    Vector3dc getPositionInModel();

    Quaterniondc getRotation();

    Vector3dc getScaling();
  }

  /** A pose as VS2 hands it out: fresh read-only JOML values on every call. */
  private abstract static class Pose {
    private final Vector3d position, pivot, scale;
    private final Quaterniond rotation;

    Pose(Vector3dc position, Vector3dc pivot, Quaterniondc rotation, Vector3dc scale) {
      this.position = new Vector3d(position);
      this.pivot = new Vector3d(pivot);
      this.rotation = new Quaterniond(rotation);
      this.scale = new Vector3d(scale);
    }

    public Vector3dc getPositionInWorld() {
      return new Vector3d(position);
    }

    Vector3dc pivot() {
      return new Vector3d(pivot);
    }

    Quaterniondc rotation() {
      return new Quaterniond(rotation);
    }

    Vector3dc scale() {
      return new Vector3d(scale);
    }
  }

  private static final class Legacy extends Pose implements LegacyTransform {
    Legacy(Vector3dc position, Vector3dc pivot, Quaterniondc rotation, Vector3dc scale) {
      super(position, pivot, rotation, scale);
    }

    @Override
    public Vector3dc getPositionInShip() {
      return pivot();
    }

    @Override
    public Quaterniondc getShipToWorldRotation() {
      return rotation();
    }

    @Override
    public Vector3dc getShipToWorldScaling() {
      return scale();
    }
  }

  private static final class Hidden extends Pose implements Transform {
    Hidden(Vector3dc position, Vector3dc pivot, Quaterniondc rotation, Vector3dc scale) {
      super(position, pivot, rotation, scale);
    }

    @Override
    public Vector3dc getPositionInModel() {
      return pivot();
    }

    @Override
    public Quaterniondc getRotation() {
      return rotation();
    }

    @Override
    public Vector3dc getScaling() {
      return scale();
    }
  }

  public record Box(int minX, int minY, int minZ, int maxX, int maxY, int maxZ) {}

  /** VS2's ship-to-world matrix, built the way {@code ShipTransform} builds it. */
  private static Vector3d shipToWorld(
      Vector3d position, Vector3d pivot, Quaterniond rotation, Vector3d scale, Vector3d point) {
    return new Matrix4d()
        .translate(position)
        .rotate(rotation)
        .scale(scale)
        .translate(-pivot.x, -pivot.y, -pivot.z)
        .transformPosition(new Vector3d(point));
  }

  private static void assertPoint(Vector3d expected, double[] actual, double tolerance) {
    assertEquals(expected.x, actual[0], tolerance);
    assertEquals(expected.y, actual[1], tolerance);
    assertEquals(expected.z, actual[2], tolerance);
  }

  @Test
  void matchesTheShipToWorldMatrix() throws ReflectiveOperationException {
    Vector3d position = new Vector3d(-312.25, 71.5, 811.75);
    Vector3d pivot = new Vector3d(YARD + 8.5, 64.5, YARD - 3.25);
    Quaterniond rotation = new Quaterniond().rotateXYZ(0.2, 0.9, -0.15);
    Vector3d scale = new Vector3d(1.5, 1.5, 1.5);
    Placement placement = ValkyrienVolumes.placement(new Hidden(position, pivot, rotation, scale));
    for (Vector3d cell :
        new Vector3d[] {
          new Vector3d(YARD + 8.5, 64.5, YARD - 3.25),
          new Vector3d(YARD + 13, 70, YARD - 5),
          new Vector3d(YARD - 2, 58, YARD + 1)
        }) {
      Vector3d expected = shipToWorld(position, pivot, rotation, scale, cell);
      // The matrix itself loses precision 28 million blocks away; the placement does not.
      assertPoint(expected, placement.toWorld(cell.x, cell.y, cell.z), 1e-6);
    }
  }

  @Test
  void readsTheGettersOfOlderCores() throws ReflectiveOperationException {
    Placement placement =
        ValkyrienVolumes.placement(
            new Legacy(
                new Vector3d(10, 65, 20),
                new Vector3d(YARD, 64, YARD),
                new Quaterniond().rotateY(Math.PI / 2),
                new Vector3d(1, 1, 1)));
    assertPoint(new Vector3d(10, 65, 20), placement.toWorld(YARD, 64, YARD), 1e-9);
    // A quarter turn about Y sends +X to -Z.
    assertPoint(new Vector3d(10, 65, 19), placement.toWorld(YARD + 1, 64, YARD), 1e-9);
    assertTrue(placement.keepsWinding());
  }

  @Test
  void callsHiddenClassesThroughTheirPublicInterface() throws NoSuchMethodException {
    Hidden hidden =
        new Hidden(new Vector3d(), new Vector3d(), new Quaterniond(), new Vector3d(1, 1, 1));
    assertEquals(
        Transform.class, ValkyrienVolumes.method(hidden, "getRotation").getDeclaringClass());
    assertThrows(NoSuchMethodException.class, () -> ValkyrienVolumes.method(hidden, "getMass"));
    assertEquals(
        Object.class, ValkyrienVolumes.method(new Object() {}, "hashCode").getDeclaringClass());
  }

  @Test
  void rejectsAnUnknownTransform() {
    assertThrows(NoSuchMethodException.class, () -> ValkyrienVolumes.placement(new Object()));
    assertThrows(NoSuchMethodException.class, () -> ValkyrienVolumes.placement(null));
    Legacy flat =
        new Legacy(new Vector3d(), new Vector3d(), new Quaterniond(), new Vector3d(1, 0, 1));
    assertThrows(IllegalArgumentException.class, () -> ValkyrienVolumes.placement(flat));
  }

  @Test
  void readsTheShipyardBlockBox() throws ReflectiveOperationException {
    assertEquals(
        new CaptureBounds(-5, 60, 7, 4, 66, 12),
        ValkyrienVolumes.shipyardCells(new Box(-5, 60, 7, 4, 66, 12)));
    assertNull(ValkyrienVolumes.shipyardCells(null));
    assertNull(ValkyrienVolumes.shipyardCells(new Box(1, 0, 0, 0, 0, 0)));
    assertNull(ValkyrienVolumes.shipyardCells(new Box(0, 1, 0, 0, 0, 0)));
    assertNull(ValkyrienVolumes.shipyardCells(new Box(0, 0, 1, 0, 0, 0)));
  }
}
