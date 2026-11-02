package dev.minemories.client;

import dev.minemories.core.ZoneScore;
import dev.minemories.core.ZoneScore.ChunkSignals;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Orders the zones the player stayed in by how much they seem to matter. Suggestions only: nothing
 * is captured.
 */
final class ZoneRanking {
  private ZoneRanking() {}

  record Suggestion(int minX, int minZ, long seconds, double score, int radius) {
    String label() {
      return "X "
          + minX
          + "…"
          + (minX + 63)
          + " · Z "
          + minZ
          + "…"
          + (minZ + 63)
          + " · "
          + seconds / 60
          + " min · "
          + Math.round(score * 100)
          + " % · r "
          + radius;
    }
  }

  static List<Suggestion> rank(List<VisitedZones.Zone> zones, ZoneInsights insights, int limit) {
    List<Suggestion> ranked = new ArrayList<>();
    for (VisitedZones.Zone zone : zones) {
      double score = score(zone, insights);
      ranked.add(
          new Suggestion(
              zone.minX(), zone.minZ(), zone.seconds(), score, ZoneScore.advisoryRadius(score)));
    }
    ranked.sort(
        Comparator.comparingDouble(Suggestion::score)
            .reversed()
            .thenComparing(Comparator.comparingLong(Suggestion::seconds).reversed())
            .thenComparingInt(Suggestion::minX)
            .thenComparingInt(Suggestion::minZ));
    return ranked.size() > limit ? List.copyOf(ranked.subList(0, limit)) : List.copyOf(ranked);
  }

  /** The 4 × 4 chunks of the zone that past captures described; time alone when none did. */
  static double score(VisitedZones.Zone zone, ZoneInsights insights) {
    List<Double> scores = new ArrayList<>();
    int firstX = Math.floorDiv(zone.minX(), 16), firstZ = Math.floorDiv(zone.minZ(), 16);
    for (int x = firstX; x < firstX + 4; x++) {
      for (int z = firstZ; z < firstZ + 4; z++) {
        ZoneInsights.Chunk chunk = insights.chunk(x, z);
        if (chunk == null) continue;
        scores.add(
            ZoneScore.chunk(
                new ChunkSignals(
                    zone.seconds(),
                    ChunkSignals.UNKNOWN,
                    chunk.builtPerMille() / 1000.0,
                    chunk.blockEntities(),
                    chunk.lights(),
                    ChunkSignals.UNKNOWN)));
      }
    }
    return scores.isEmpty()
        ? ZoneScore.chunk(ChunkSignals.activeOnly(zone.seconds()))
        : ZoneScore.zone(scores);
  }
}
