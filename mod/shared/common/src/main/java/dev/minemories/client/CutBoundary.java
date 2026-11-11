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

  /** Highest non-air row of a column (the world-surface heightmap), below the capture if none. */
  interface Surface {
    int at(int x, int z);
  }

  /**
   * The open air of a capture, found by flood fill through the volume. A cell is open when
   * non-opaque cells connect it to the sky (the top layer of the capture, or any cell above its
   * column's surface), or to the player's own cell at capture time. A cut cell of air or fluid that
   * is not open is a pocket cut off from both (a cave, a pool, a sealed room) and the only kind
   * that gets a seal. Open air under a canopy, an overhang, a floating island or a roof reaches the
   * sky around the obstacle, and a cavern or a room the player stands in stays open however closed
   * it is.
   *
   * <p>The cells above a column's surface are open by definition and are never visited, so the fill
   * only walks the air under the surface: a cave, the air of a tree, a Nether cavern. It is capped
   * at {@link #LIMIT} cells; past that nothing is sealed at all, never a wall too many. {@link
   * #advance} works in slices so the progressive capture can spread it over frames.
   */
  static final class OpenAir {
    static final int LIMIT = 6_000_000;

    private final CaptureBounds bounds;
    private final Passable passable;
    private final long sizeX, sizeZ;
    private final int[] surface;
    private final java.util.BitSet open = new java.util.BitSet();
    private final java.util.ArrayDeque<int[]> pending = new java.util.ArrayDeque<>();
    private int count;
    private boolean exceeded;

    OpenAir(CaptureBounds bounds, Passable passable, Surface surface, int[][] playerCells) {
      this.bounds = bounds;
      this.passable = passable;
      this.sizeX = (long) bounds.maxX() - bounds.minX() + 1;
      this.sizeZ = (long) bounds.maxZ() - bounds.minZ() + 1;
      this.surface = new int[(int) (sizeX * sizeZ)];
      for (int z = bounds.minZ(); z <= bounds.maxZ(); z++)
        for (int x = bounds.minX(); x <= bounds.maxX(); x++)
          this.surface[column(x, z)] = surface.at(x, z);
      for (int z = bounds.minZ(); z <= bounds.maxZ(); z++) {
        for (int x = bounds.minX(); x <= bounds.maxX(); x++) {
          // Seeds: the top layer, and the sky cells that touch a higher neighbouring column.
          reach(x, bounds.maxY(), z);
          int top = Math.min(bounds.maxY(), neighbourSurface(x, z));
          for (int y = Math.max(bounds.minY(), this.surface[column(x, z)] + 1); y <= top; y++)
            pending.add(new int[] {x, y, z});
        }
      }
      for (int[] cell : playerCells) reach(cell[0], cell[1], cell[2]);
    }

    private int neighbourSurface(int x, int z) {
      int best = Integer.MIN_VALUE;
      if (x > bounds.minX()) best = Math.max(best, surface[column(x - 1, z)]);
      if (x < bounds.maxX()) best = Math.max(best, surface[column(x + 1, z)]);
      if (z > bounds.minZ()) best = Math.max(best, surface[column(x, z - 1)]);
      if (z < bounds.maxZ()) best = Math.max(best, surface[column(x, z + 1)]);
      return best;
    }

    private int column(int x, int z) {
      return (int) ((long) (z - bounds.minZ()) * sizeX + (x - bounds.minX()));
    }

    private int index(int x, int y, int z) {
      return (int)
          (((long) y - bounds.minY()) * sizeZ * sizeX
              + ((long) z - bounds.minZ()) * sizeX
              + ((long) x - bounds.minX()));
    }

    private boolean sky(int x, int y, int z) {
      return y > surface[column(x, z)];
    }

    /** Marks a passable cell open and queues it, unless it is sky (open without a visit). */
    private void reach(int x, int y, int z) {
      if (outside(bounds, x, y, z)) return;
      int i = index(x, y, z);
      if (open.get(i)) return;
      if (!sky(x, y, z) && !passable.at(x, y, z)) return;
      open.set(i);
      if (sky(x, y, z)) return;
      if (++count > LIMIT) exceeded = true;
      pending.add(new int[] {x, y, z});
    }

    /** Visits at most {@code cells} queued cells; true when the fill is finished. */
    boolean advance(int cells) {
      int[][] steps = {{1, 0, 0}, {-1, 0, 0}, {0, 1, 0}, {0, -1, 0}, {0, 0, 1}, {0, 0, -1}};
      for (int n = 0; n < cells && !pending.isEmpty() && !exceeded; n++) {
        int[] cell = pending.poll();
        for (int[] step : steps) reach(cell[0] + step[0], cell[1] + step[1], cell[2] + step[2]);
      }
      return pending.isEmpty() || exceeded;
    }

    /** Runs the fill to its end. */
    void settle() {
      while (!advance(1 << 16)) {
        // keep going
      }
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
     * Whether this shell cell is a pocket cut off from the sky and the player. Only meaningful for
     * a passable cell (air, fluid). Nothing is enclosed when the fill ran past its cap.
     */
    boolean enclosed(int x, int y, int z) {
      return !exceeded && onShell(x, y, z) && !sky(x, y, z) && !open.get(index(x, y, z));
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
