package dev.minemories.neoforge;

/** Temporary one-minute AFK cadence for in-game debugging. */
final class AfkTiming {
  private static final long INTERVAL_MS = 60_000;

  private AfkTiming() {}

  static long remainingSeconds(long now, long lastActivity, long lastSnapshot) {
    long remaining =
        Math.max(INTERVAL_MS - (now - lastActivity), INTERVAL_MS - (now - lastSnapshot));
    return Math.max(0, (remaining + 999) / 1000);
  }
}
