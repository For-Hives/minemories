package dev.minemories.client;

/** Wall-clock scheduling continues while the integrated server is paused. */
final class AfkTiming {
  private AfkTiming() {}

  static long remainingSeconds(
      long now, long lastActivity, long lastSnapshot, ClientSettings.AfkOptions options) {
    long idleMs = options.idleMinutes() * 60_000L;
    long intervalMs = options.intervalMinutes() * 60_000L;
    long remaining = Math.max(idleMs - (now - lastActivity), intervalMs - (now - lastSnapshot));
    return Math.max(0, (remaining + 999) / 1000);
  }
}
