package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class AfkTimingTest {
  private static final ClientSettings.AfkOptions OPTIONS = new ClientSettings.AfkOptions(1, 1, 32);

  @Test
  void firesAfterExactlyOneMinuteIdle() {
    assertEquals(1, AfkTiming.remainingSeconds(159_999, 100_000, 0, OPTIONS));
    assertEquals(0, AfkTiming.remainingSeconds(160_000, 100_000, 0, OPTIONS));
  }

  @Test
  void recentCaptureDelaysNextSnapshotByOneMinuteInsteadOfFourHours() {
    assertEquals(30, AfkTiming.remainingSeconds(160_000, 0, 130_000, OPTIONS));
    assertEquals(0, AfkTiming.remainingSeconds(190_000, 0, 130_000, OPTIONS));
  }

  @Test
  void newActivityResetsCountdownAndLongIdleDoesNotReturnNegativeTime() {
    assertEquals(60, AfkTiming.remainingSeconds(160_000, 160_000, 0, OPTIONS));
    assertEquals(0, AfkTiming.remainingSeconds(1_000_000, 0, 0, OPTIONS));
  }

  @Test
  void productionCadenceUsesElapsedTimeIndependentOfPausedWorldTicks() {
    var options = new ClientSettings.AfkOptions(5, 240, 32);
    assertEquals(1, AfkTiming.remainingSeconds(14_699_999, 14_400_000, 0, options));
    assertEquals(0, AfkTiming.remainingSeconds(14_700_000, 14_400_000, 0, options));
    assertEquals(14_100, AfkTiming.remainingSeconds(14_700_000, 14_400_000, 14_400_000, options));
  }
}
