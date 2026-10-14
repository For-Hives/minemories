package dev.minemories.neoforge;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

/** Bounded local active-time scores, aggregated into non-overlapping 64-block zones. */
final class VisitedZones {
  static final int MAX_ZONES = 10_000;
  private static final long MAX_SECONDS = 365L * 24 * 60 * 60;
  private final Map<Long, Long> seconds = new LinkedHashMap<>();
  private boolean dirty;
  private long lastSample;
  private boolean previousEligible;

  record Zone(int minX, int minZ, long seconds) {
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
          + " min";
    }
  }

  void sample(int x, int z, long now, boolean active, boolean loaded) {
    long elapsed = now - lastSample;
    // Depth tracking also calls us every tick: frequent samples must not postpone the deadline.
    if (now > lastSample && elapsed < 1000) {
      previousEligible = previousEligible && active && loaded;
      return;
    }
    boolean continuous = previousEligible && now > 0 && elapsed >= 1000 && elapsed <= 2000;
    lastSample = now;
    previousEligible = active && loaded && now > 0;
    // No catch-up after pause, disconnect, clock changes or a stalled client.
    if (!active || !loaded || !continuous) return;
    int zoneX = Math.floorDiv(x, 64);
    int zoneZ = Math.floorDiv(z, 64);
    long key = ((long) zoneX << 32) | (zoneZ & 0xffffffffL);
    Long previous = seconds.remove(key);
    if (previous == null && seconds.size() >= MAX_ZONES) {
      seconds.remove(seconds.keySet().iterator().next());
    }
    seconds.put(key, Math.min(MAX_SECONDS, (previous == null ? 0 : previous) + 1));
    dirty = true;
  }

  List<Zone> suggestions() {
    return seconds.entrySet().stream()
        .filter(entry -> entry.getValue() >= 60)
        .map(
            entry ->
                new Zone(
                    (int) (entry.getKey() >> 32) * 64,
                    (int) (long) entry.getKey() * 64,
                    entry.getValue()))
        .sorted(
            Comparator.comparingLong(Zone::seconds)
                .reversed()
                .thenComparingInt(Zone::minX)
                .thenComparingInt(Zone::minZ))
        .limit(5)
        .toList();
  }

  static VisitedZones read(Path path) throws IOException {
    VisitedZones history = new VisitedZones();
    if (!Files.exists(path, LinkOption.NOFOLLOW_LINKS)) return history;
    if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) || Files.size(path) > 1024 * 1024)
      throw new IOException("Invalid or oversized zone history");
    Properties data = ClientSettings.read(path);
    for (String key : data.stringPropertyNames()) {
      if (history.seconds.size() >= MAX_ZONES) break;
      try {
        long packed = Long.parseLong(key);
        long score = Long.parseLong(data.getProperty(key));
        long x = packed >> 32;
        long z = (int) packed;
        if (score > 0
            && score <= MAX_SECONDS
            && x >= -33_554_432
            && x <= 33_554_431
            && z >= -33_554_432
            && z <= 33_554_431) history.seconds.put(packed, score);
      } catch (NumberFormatException ignored) {
        // Recover other entries from a damaged local history.
      }
    }
    return history;
  }

  void save(Path path) throws IOException {
    if (!dirty) return;
    Properties data = new Properties();
    for (var entry : seconds.entrySet())
      data.setProperty(entry.getKey().toString(), entry.getValue().toString());
    ClientSettings.save(path, data);
    dirty = false;
  }
}
