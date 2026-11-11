package dev.minemories.client;

/** Export-only cross sections; never changes the world and never walls off open air. */
final class CutBoundary {
  private CutBoundary() {}

  static boolean onPlane(float[] vertices, int axis, float plane) {
    if (vertices.length != 12 || axis < 0 || axis > 2 || !Float.isFinite(plane)) return false;
    for (int i = 0; i < 4; i++) {
      float coordinate = vertices[i * 3 + axis];
      if (!Float.isFinite(coordinate) || Math.abs(coordinate - plane) > 0.00001f) return false;
    }
    return true;
  }

  static boolean outside(CaptureBounds bounds, int x, int y, int z) {
    return x < bounds.minX()
        || x > bounds.maxX()
        || y < bounds.minY()
        || y > bounds.maxY()
        || z < bounds.minZ()
        || z > bounds.maxZ();
  }

  /**
   * Whether the seal of this cut cell must be seen from both sides. A solid block's cut face
   * replaces its own outer face, seen from outside only; but the seal of an empty cell (a cave, an
   * underground fluid) is also the floor or wall seen from inside it, and a single-sided outward
   * face would show the sky there.
   */
  static boolean sealsBothSides(boolean air, boolean fluid) {
    return air || fluid;
  }

  /**
   * The same quad facing the other way: corners in reverse order (0, 3, 2, 1), each keeping its
   * texture coordinates, so the texture stays in place and the winding, hence the normal, flips.
   */
  static void reverse(float[] xyz, float[] uv, float[] reversedXyz, float[] reversedUv) {
    for (int corner = 0; corner < 4; corner++) {
      int from = (4 - corner) % 4;
      System.arraycopy(xyz, from * 3, reversedXyz, corner * 3, 3);
      System.arraycopy(uv, from * 2, reversedUv, corner * 2, 2);
    }
  }

  /** Whether a cell lets the outside through: anything but an opaque full cube. */
  interface Passable {
    boolean at(int x, int y, int z);
  }

  /**
   * The cells of the cut shell (the four sides and the bottom of the capture) that are open to the
   * sky, found by flood fill along the shell from its top row. A cut cell of air or fluid that the
   * fill never reaches is enclosed by the terrain on the shell: a cave, a pool or a pocket the
   * boundary slices through, and the only cells that get a seal. Open air under a canopy, an
   * overhang, a floating island or a build's roof reaches the top row around the obstacle, so it
   * stays open. A capture taken inside a closed space (the Nether, a cave) has no way out on the
   * shell either: its cavities are then sealed like any other cave, with the material around them.
   */
  static final class Shell {
    private final CaptureBounds bounds;
    private final long sizeX, sizeZ;
    private final java.util.BitSet open = new java.util.BitSet();

    Shell(CaptureBounds bounds, Passable passable) {
      this.bounds = bounds;
      this.sizeX = (long) bounds.maxX() - bounds.minX() + 1;
      this.sizeZ = (long) bounds.maxZ() - bounds.minZ() + 1;
      flood(passable);
    }

    boolean onShell(int x, int y, int z) {
      return !outside(bounds, x, y, z)
          && (x == bounds.minX()
              || x == bounds.maxX()
              || z == bounds.minZ()
              || z == bounds.maxZ()
              || y == bounds.minY());
    }

    /**
     * Whether this shell cell is cut off from the open air along the shell. Only meaningful for a
     * passable cell (air, fluid): a solid cell is never reached by the fill.
     */
    boolean enclosed(int x, int y, int z) {
      return onShell(x, y, z) && !open.get(index(x, y, z));
    }

    private int index(int x, int y, int z) {
      return (int)
          (((long) y - bounds.minY()) * sizeZ * sizeX
              + ((long) z - bounds.minZ()) * sizeX
              + ((long) x - bounds.minX()));
    }

    private void flood(Passable passable) {
      int[][] steps = {{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}};
      java.util.ArrayDeque<int[]> pending = new java.util.ArrayDeque<>();
      for (int z = bounds.minZ(); z <= bounds.maxZ(); z++) {
        for (int x = bounds.minX(); x <= bounds.maxX(); x++) {
          if (onShell(x, bounds.maxY(), z) && passable.at(x, bounds.maxY(), z)) {
            open.set(index(x, bounds.maxY(), z));
            pending.add(new int[] {x, bounds.maxY(), z});
          }
        }
      }
      while (!pending.isEmpty()) {
        int[] cell = pending.poll();
        for (int[] step : steps) {
          int x = cell[0] + step[0], y = cell[1] + step[1], z = cell[2] + step[2];
          if (!onShell(x, y, z) || open.get(index(x, y, z)) || !passable.at(x, y, z)) continue;
          open.set(index(x, y, z));
          pending.add(new int[] {x, y, z});
        }
      }
    }
  }

  /** What an enclosed cut cell is sealed with, when no block of its column says otherwise. */
  enum Fallback {
    STONE,
    DEEPSLATE,
    NETHERRACK,
    END_STONE
  }

  /** Per-dimension fallback: the rock of that dimension, deepslate under y = 0 in the overworld. */
  static Fallback fallback(String dimension, int y) {
    return switch (dimension) {
      case "minecraft:the_nether" -> Fallback.NETHERRACK;
      case "minecraft:the_end" -> Fallback.END_STONE;
      default -> y < 0 ? Fallback.DEEPSLATE : Fallback.STONE;
    };
  }

  /**
   * The row of the opaque cube that gives a seal its look: the nearest one below the cell (a cave
   * floor, or the rock around it), else the nearest one above it. {@code Integer.MIN_VALUE} when
   * the column has none within the capture.
   */
  static int nearestSolid(int y, int minY, int maxY, java.util.function.IntPredicate solidAt) {
    for (int below = y - 1; below >= minY; below--) if (solidAt.test(below)) return below;
    for (int above = y + 1; above <= maxY; above++) if (solidAt.test(above)) return above;
    return Integer.MIN_VALUE;
  }
}
