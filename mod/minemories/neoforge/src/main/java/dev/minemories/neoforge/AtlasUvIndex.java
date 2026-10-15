package dev.minemories.neoforge;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Bounded UV lookup: copying a renderer's sprite must not require copying its entire atlas. */
final class AtlasUvIndex<T> {
  private static final int MAX_MATCHES = 256;
  private static final int MAX_SCAN = 1_048_576;
  private static final long MAX_TOTAL_SCAN = 32L * MAX_SCAN;
  private final Iterable<Region<T>> regions;
  private final List<Region<T>> matches = new ArrayList<>();
  private final SearchBudget budget;

  static final class SearchBudget {
    private long scanned;

    void visit() throws IOException {
      if (++scanned > MAX_TOTAL_SCAN)
        throw new IOException("La recherche des sprites du renderer dépasse son budget.");
    }
  }

  record Region<T>(float u0, float v0, float u1, float v1, T value) {
    Region {
      Objects.requireNonNull(value);
      if (!(u0 >= 0 && v0 >= 0 && u1 <= 1 && v1 <= 1 && u0 < u1 && v0 < v1))
        throw new IllegalArgumentException("Invalid atlas sprite bounds");
    }

    boolean contains(float minU, float minV, float maxU, float maxV) {
      float tolerance = 0.000001f;
      return minU >= u0 - tolerance
          && minV >= v0 - tolerance
          && maxU <= u1 + tolerance
          && maxV <= v1 + tolerance;
    }

    void remap(float[] uv) {
      for (int i = 0; i < uv.length; i += 2) {
        uv[i] = Math.clamp((uv[i] - u0) / (u1 - u0), 0f, 1f);
        uv[i + 1] = Math.clamp((uv[i + 1] - v0) / (v1 - v0), 0f, 1f);
      }
    }
  }

  /** Keep the atlas's lazy view; retain only the few sprites actually used by the capture. */
  AtlasUvIndex(Iterable<Region<T>> regions) {
    this(regions, new SearchBudget());
  }

  AtlasUvIndex(Iterable<Region<T>> regions, SearchBudget budget) {
    this.regions = Objects.requireNonNull(regions);
    this.budget = Objects.requireNonNull(budget);
  }

  /** Non-finite UVs are discarded, just like invalid primitives in the GLB writer. */
  Region<T> find(float[] uv) throws IOException {
    if (uv.length != 8) throw new IllegalArgumentException("Expected four UV pairs");
    float minU = 1, minV = 1, maxU = 0, maxV = 0;
    for (int i = 0; i < uv.length; i += 2) {
      if (!(Float.isFinite(uv[i]) && Float.isFinite(uv[i + 1]))) return null;
      minU = Math.min(minU, uv[i]);
      maxU = Math.max(maxU, uv[i]);
      minV = Math.min(minV, uv[i + 1]);
      maxV = Math.max(maxV, uv[i + 1]);
    }
    if (minU < 0 || minV < 0 || maxU > 1 || maxV > 1)
      throw new IOException("UV du renderer hors de l’atlas.");
    for (Region<T> region : matches) if (region.contains(minU, minV, maxU, maxV)) return region;
    if (matches.size() == MAX_MATCHES)
      throw new IOException("Trop de sprites utilisés par les renderers.");
    int visited = 0;
    for (Region<T> region : regions) {
      if (++visited > MAX_SCAN)
        throw new IOException("La recherche des sprites du renderer dépasse son budget.");
      budget.visit();
      if (region.contains(minU, minV, maxU, maxV)) {
        matches.add(region);
        return region;
      }
    }
    throw new IOException("Les UV du renderer ne correspondent pas à un sprite exportable.");
  }
}
