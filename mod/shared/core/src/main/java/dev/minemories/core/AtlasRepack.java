package dev.minemories.core;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InterruptedIOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import javax.imageio.ImageIO;

/**
 * Rebuilds a mostly unused atlas as a small image holding only the texels its primitives can
 * sample, one texel of margin included, and gives each primitive the affine UV remap that keeps
 * every sampled texel identical (the samplers are NEAREST, so no filtering depends on neighbours).
 */
final class AtlasRepack {
  static final int MAX_RECTANGLES = 2048;

  private AtlasRepack() {}

  /** Replacement image and, per input primitive, {@code u' = u * scaleU + offsetU} (same for v). */
  record Plan(byte[] png, double scaleU, double scaleV, double[] offsetU, double[] offsetV) {}

  private record Rect(int x0, int y0, int x1, int y1) {
    int width() {
      return x1 - x0;
    }

    int height() {
      return y1 - y0;
    }

    boolean overlaps(Rect other) {
      return x0 < other.x1 && other.x0 < x1 && y0 < other.y1 && other.y0 < y1;
    }

    Rect union(Rect other) {
      return new Rect(
          Math.min(x0, other.x0),
          Math.min(y0, other.y0),
          Math.max(x1, other.x1),
          Math.max(y1, other.y1));
    }
  }

  /** Null when the repack is unsafe or would not at least halve the texel count. */
  static Plan plan(byte[] original, int width, int height, List<UvBounds> users)
      throws IOException {
    if (users.isEmpty() || users.size() > MAX_RECTANGLES) return null;
    List<Rect> needed = new ArrayList<>();
    Rect[] own = new Rect[users.size()];
    for (int index = 0; index < own.length; index++) {
      UvBounds bounds = users.get(index);
      if (bounds.empty()) return null;
      own[index] =
          new Rect(
              Math.max(0, (int) Math.floor(bounds.minU * width) - 1),
              Math.max(0, (int) Math.floor(bounds.minV * height) - 1),
              Math.min(width, (int) Math.floor(bounds.maxU * width) + 2),
              Math.min(height, (int) Math.floor(bounds.maxV * height) + 2));
      needed.add(own[index]);
    }
    List<Rect> merged = merge(needed);
    int[][] place = new int[merged.size()][];
    int[] size = pack(merged, width, place);
    if (size == null || (long) size[0] * size[1] * 2 > (long) width * height) return null;
    BufferedImage source = ImageIO.read(new ByteArrayInputStream(original));
    if (source == null || source.getWidth() != width || source.getHeight() != height) return null;
    BufferedImage target = new BufferedImage(size[0], size[1], BufferedImage.TYPE_INT_ARGB);
    int[] row = new int[width];
    for (int index = 0; index < merged.size(); index++) {
      interrupted();
      Rect rect = merged.get(index);
      for (int y = 0; y < rect.height(); y++) {
        source.getRGB(rect.x0, rect.y0 + y, rect.width(), 1, row, 0, rect.width());
        target.setRGB(place[index][0], place[index][1] + y, rect.width(), 1, row, 0, rect.width());
      }
    }
    ByteArrayOutputStream encoded = new ByteArrayOutputStream();
    if (!ImageIO.write(target, "png", encoded)) return null;
    double[] offsetU = new double[own.length], offsetV = new double[own.length];
    for (int index = 0; index < own.length; index++) {
      int owner = owner(merged, own[index]);
      offsetU[index] = (double) (place[owner][0] - merged.get(owner).x0) / size[0];
      offsetV[index] = (double) (place[owner][1] - merged.get(owner).y0) / size[1];
    }
    return new Plan(
        encoded.toByteArray(),
        (double) width / size[0],
        (double) height / size[1],
        offsetU,
        offsetV);
  }

  private static int owner(List<Rect> merged, Rect rect) {
    for (int index = 0; index < merged.size(); index++) {
      Rect candidate = merged.get(index);
      if (candidate.x0 <= rect.x0
          && candidate.y0 <= rect.y0
          && candidate.x1 >= rect.x1
          && candidate.y1 >= rect.y1) return index;
    }
    throw new IllegalStateException("A merged rectangle always contains its sources");
  }

  private static List<Rect> merge(List<Rect> rects) {
    List<Rect> result = new ArrayList<>(rects);
    boolean changed = true;
    while (changed) {
      changed = false;
      for (int first = 0; first < result.size() && !changed; first++) {
        for (int second = first + 1; second < result.size(); second++) {
          if (result.get(first).overlaps(result.get(second))) {
            result.set(first, result.get(first).union(result.get(second)));
            result.remove(second);
            changed = true;
            break;
          }
        }
      }
    }
    return result;
  }

  /** Shelf packing; tries power-of-two widths and keeps the smallest area. Returns {w, h}. */
  private static int[] pack(List<Rect> rects, int maximumWidth, int[][] place) {
    List<Integer> order = new ArrayList<>();
    for (int index = 0; index < rects.size(); index++) order.add(index);
    order.sort(
        Comparator.comparingInt((Integer index) -> -rects.get(index).height())
            .thenComparingInt(index -> -rects.get(index).width()));
    int widest = 0;
    for (Rect rect : rects) widest = Math.max(widest, rect.width());
    int[] best = null;
    int[][] bestPlace = null;
    for (int limit = 16; limit / 2 < maximumWidth; limit *= 2) {
      int width = Math.min(limit, maximumWidth);
      if (width < widest) continue;
      int[][] trial = new int[rects.size()][];
      int x = 0, y = 0, shelf = 0, used = 0;
      for (int index : order) {
        Rect rect = rects.get(index);
        if (x + rect.width() > width) {
          y += shelf;
          x = 0;
          shelf = 0;
        }
        trial[index] = new int[] {x, y};
        x += rect.width();
        used = Math.max(used, x);
        shelf = Math.max(shelf, rect.height());
      }
      int height = y + shelf;
      if (best == null || (long) used * height < (long) best[0] * best[1]) {
        best = new int[] {used, height};
        bestPlace = trial;
      }
    }
    if (best == null) return null;
    System.arraycopy(bestPlace, 0, place, 0, place.length);
    return best;
  }

  private static void interrupted() throws InterruptedIOException {
    if (Thread.currentThread().isInterrupted())
      throw new InterruptedIOException("Atlas repack interrupted");
  }
}
