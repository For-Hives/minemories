package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import dev.minemories.core.ChunkStats;
import java.util.List;
import org.junit.jupiter.api.Test;

class ZoneRankingTest {
  private static VisitedZones.Zone zone(int x, int z, long seconds) {
    return new VisitedZones.Zone(x, z, seconds);
  }

  @Test
  void withoutCapturesOnlyTimeCountsAndALongerStayRanksFirst() {
    var ranked =
        ZoneRanking.rank(
            List.of(zone(0, 0, 600), zone(64, 0, 3600), zone(-64, 0, 120)), new ZoneInsights(), 5);
    assertEquals(List.of(64, 0, -64), ranked.stream().map(ZoneRanking.Suggestion::minX).toList());
    assertTrue(ranked.get(0).score() > ranked.get(1).score());
  }

  @Test
  void aBuiltZoneOutranksALongerStayInUntouchedWilderness() {
    var insights = new ZoneInsights();
    // Zone (64, 0) covers absolute chunks 4..7 × 0..3: a built chunk with chests and lamps.
    insights.merge(
        64,
        0,
        List.of(
            new ChunkStats.Chunk(0, 0, 1000, 450, 240, 20, 1),
            new ChunkStats.Chunk(1, 0, 1000, 0, 0, 0, 2)));
    // Zone (0, 0) is described as pure wilderness.
    insights.merge(0, 0, List.of(new ChunkStats.Chunk(0, 0, 1000, 0, 0, 0, 3)));
    var ranked = ZoneRanking.rank(List.of(zone(0, 0, 3000), zone(64, 0, 700)), insights, 5);
    assertEquals(64, ranked.get(0).minX());
    assertTrue(ranked.get(0).score() > 0.6, "built " + ranked.get(0).score());
    assertTrue(ranked.get(1).score() < 0.45, "wild " + ranked.get(1).score());
    assertTrue(ranked.get(0).radius() > ranked.get(1).radius());
  }

  @Test
  void theListIsLimitedTiesAreStableAndLabelsShowTheScoreAndAdvisoryRadius() {
    var zones = List.of(zone(128, 0, 100), zone(0, 0, 100), zone(0, 64, 100), zone(64, 0, 100));
    var ranked = ZoneRanking.rank(zones, new ZoneInsights(), 3);
    assertEquals(3, ranked.size());
    assertEquals(List.of(0, 0, 64), ranked.stream().map(ZoneRanking.Suggestion::minX).toList());
    assertEquals(List.of(0, 64, 0), ranked.stream().map(ZoneRanking.Suggestion::minZ).toList());
    assertEquals(4, ZoneRanking.rank(zones, new ZoneInsights(), 9).size());
    String label = ranked.get(0).label();
    assertTrue(label.contains("1 min") && label.contains(" % · r "), label);
  }
}
