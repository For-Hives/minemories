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

  /**
   * Observed changes stand for the player's edits: each one is at least a block placed or broken.
   */
  static final int EDITS_PER_OBSERVED_CHANGE = 16;

  static ChunkSignals signals(long seconds, ZoneInsights.Chunk chunk) {
    return new ChunkSignals(
        seconds,
        // No observed change is not evidence of no edits (a first capture cannot tell): it stays
        // unknown.
        chunk.changes() > 0 ? chunk.changes() * EDITS_PER_OBSERVED_CHANGE : ChunkSignals.UNKNOWN,
        chunk.builtPerMille() / 1000.0,
        chunk.blockEntities(),
        chunk.lights(),
        chunk.inhabitedTicks());
  }

  /**
   * Capture radius for an AFK capture. A radius the player stored is never touched; without one,
   * the advisory radius of the zone is used once past captures described it, and the usual default
   * otherwise.
   */
  static int adaptiveRadius(int configured, boolean explicit, boolean informed, double score) {
    if (explicit || !informed) return configured;
    return ZoneScore.advisoryRadius(score);
  }

  static boolean informed(VisitedZones.Zone zone, ZoneInsights insights) {
    int firstX = Math.floorDiv(zone.minX(), 16), firstZ = Math.floorDiv(zone.minZ(), 16);
    for (int x = firstX; x < firstX + 4; x++) {
      for (int z = firstZ; z < firstZ + 4; z++) if (insights.chunk(x, z) != null) return true;
    }
    return false;
  }

  /** The 4 × 4 chunks of the zone that past captures described; time alone when none did. */
  static double score(VisitedZones.Zone zone, ZoneInsights insights) {
    List<Double> scores = new ArrayList<>();
    int firstX = Math.floorDiv(zone.minX(), 16), firstZ = Math.floorDiv(zone.minZ(), 16);
    for (int x = firstX; x < firstX + 4; x++) {
      for (int z = firstZ; z < firstZ + 4; z++) {
        ZoneInsights.Chunk chunk = insights.chunk(x, z);
        if (chunk == null) continue;
        scores.add(ZoneScore.chunk(signals(zone.seconds(), chunk)));
      }
    }
    return scores.isEmpty()
        ? ZoneScore.chunk(ChunkSignals.activeOnly(zone.seconds()))
        : ZoneScore.zone(scores);
  }
}
