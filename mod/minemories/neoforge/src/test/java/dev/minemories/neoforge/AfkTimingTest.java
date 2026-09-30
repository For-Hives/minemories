package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class AfkTimingTest {
  @Test
  void firesAfterExactlyOneMinuteIdle() {
    assertEquals(1, AfkTiming.remainingSeconds(159_999, 100_000, 0));
    assertEquals(0, AfkTiming.remainingSeconds(160_000, 100_000, 0));
  }

  @Test
  void recentCaptureDelaysNextSnapshotByOneMinuteInsteadOfFourHours() {
    assertEquals(30, AfkTiming.remainingSeconds(160_000, 0, 130_000));
    assertEquals(0, AfkTiming.remainingSeconds(190_000, 0, 130_000));
  }

  @Test
  void newActivityResetsCountdownAndLongIdleDoesNotReturnNegativeTime() {
    assertEquals(60, AfkTiming.remainingSeconds(160_000, 160_000, 0));
    assertEquals(0, AfkTiming.remainingSeconds(1_000_000, 0, 0));
  }
}
