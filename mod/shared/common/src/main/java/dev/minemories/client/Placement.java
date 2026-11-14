package dev.minemories.client;

/**
 * Where a detached block volume is drawn: {@code world = rotation · ((local − pivot) ∘ scale) +
 * position}, the convention of Sable's {@code Pose3d} and of a ship-to-world matrix without shear.
 * Kept in double precision: a volume's storage can sit tens of millions of blocks away.
 */
record Placement(
    double positionX,
    double positionY,
    double positionZ,
    double rotationX,
    double rotationY,
    double rotationZ,
    double rotationW,
    double pivotX,
    double pivotY,
    double pivotZ,
    double scaleX,
    double scaleY,
    double scaleZ) {

  Placement {
    double length =
        Math.sqrt(
            rotationX * rotationX
                + rotationY * rotationY
                + rotationZ * rotationZ
                + rotationW * rotationW);
    if (!Double.isFinite(length) || length < 1e-9)
      throw new IllegalArgumentException("Invalid placement rotation");
    rotationX /= length;
    rotationY /= length;
    rotationZ /= length;
    rotationW /= length;
    for (double value :
        new double[] {
          positionX, positionY, positionZ, pivotX, pivotY, pivotZ, scaleX, scaleY, scaleZ
        }) {
      if (!Double.isFinite(value)) throw new IllegalArgumentException("Invalid placement");
    }
    if (Math.abs(scaleX) < 1e-9 || Math.abs(scaleY) < 1e-9 || Math.abs(scaleZ) < 1e-9)
      throw new IllegalArgumentException("Invalid placement scale");
  }

  /** A translation only, as drawn by a volume that never turns. */
  static Placement translation(double x, double y, double z) {
    return new Placement(x, y, z, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1);
  }

  double[] toWorld(double x, double y, double z) {
    return rotate((x - pivotX) * scaleX, (y - pivotY) * scaleY, (z - pivotZ) * scaleZ, false);
  }

  double[] toLocal(double x, double y, double z) {
    double[] turned = rotate(x - positionX, y - positionY, z - positionZ, true);
    return new double[] {
      turned[0] / scaleX + pivotX, turned[1] / scaleY + pivotY, turned[2] / scaleZ + pivotZ
    };
  }

  /** The block cells whose storage can be drawn inside the world box (inclusive cell bounds). */
  CaptureBounds localCells(
      double minX, double minY, double minZ, double maxX, double maxY, double maxZ) {
    double[] low = {Double.MAX_VALUE, Double.MAX_VALUE, Double.MAX_VALUE};
    double[] high = {-Double.MAX_VALUE, -Double.MAX_VALUE, -Double.MAX_VALUE};
    for (int corner = 0; corner < 8; corner++) {
      double[] local =
          toLocal(
              (corner & 1) == 0 ? minX : maxX,
              (corner & 2) == 0 ? minY : maxY,
              (corner & 4) == 0 ? minZ : maxZ);
      for (int axis = 0; axis < 3; axis++) {
        low[axis] = Math.min(low[axis], local[axis]);
        high[axis] = Math.max(high[axis], local[axis]);
      }
    }
    return new CaptureBounds(
        cell(low[0]), cell(low[1]), cell(low[2]), cell(high[0]), cell(high[1]), cell(high[2]));
  }

  private static int cell(double coordinate) {
    double floor = Math.floor(coordinate);
    if (floor < Integer.MIN_VALUE || floor > Integer.MAX_VALUE)
      throw new IllegalArgumentException("Placement outside the world");
    return (int) floor;
  }

  /**
   * Maps a primitive written relative to the local block {@code origin} into the capture's frame,
   * relative to the capture {@code center}. Returns a new array.
   */
  float[] toCapture(float[] xyz, int[] origin, int[] center) {
    float[] mapped = new float[xyz.length];
    for (int index = 0; index + 2 < xyz.length; index += 3) {
      double[] world =
          toWorld(
              origin[0] + (double) xyz[index],
              origin[1] + (double) xyz[index + 1],
              origin[2] + (double) xyz[index + 2]);
      mapped[index] = (float) (world[0] - center[0]);
      mapped[index + 1] = (float) (world[1] - center[1]);
      mapped[index + 2] = (float) (world[2] - center[2]);
    }
    return mapped;
  }

  /**
   * Whether the rotation and scale keep a quad's winding (a mirror would turn faces inside out).
   */
  boolean keepsWinding() {
    return scaleX * scaleY * scaleZ > 0;
  }

  /** {@code v + 2w(q × v) + 2 q × (q × v)} for the unit quaternion, or its inverse. */
  private double[] rotate(double x, double y, double z, boolean inverse) {
    double qx = inverse ? -rotationX : rotationX;
    double qy = inverse ? -rotationY : rotationY;
    double qz = inverse ? -rotationZ : rotationZ;
    double tx = 2 * (qy * z - qz * y);
    double ty = 2 * (qz * x - qx * z);
    double tz = 2 * (qx * y - qy * x);
    double rx = x + rotationW * tx + (qy * tz - qz * ty);
    double ry = y + rotationW * ty + (qz * tx - qx * tz);
    double rz = z + rotationW * tz + (qx * ty - qy * tx);
    return inverse
        ? new double[] {rx, ry, rz}
        : new double[] {rx + positionX, ry + positionY, rz + positionZ};
  }
}
