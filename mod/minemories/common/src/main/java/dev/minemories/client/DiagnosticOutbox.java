package dev.minemories.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Objects;
import java.util.Properties;

/** Bounded, identity-bound sanitized reports. Never stores credentials or raw crash logs. */
final class DiagnosticOutbox {
  static final int MAX_REPORTS = 8;
  private static final long HOUR = 3_600_000;
  private static final long MAX_FILE_BYTES = 128 * 1024;
  private final Path path;
  private final ArrayDeque<JsonObject> reports = new ArrayDeque<>();
  private String binding;
  private boolean bound;
  private boolean authorized;
  private long retryAt;
  private long windowStarted;
  private int attempts;

  DiagnosticOutbox(Path path) {
    this.path = path;
  }

  void bind(String value, long now) {
    if (bound && Objects.equals(binding, value)) return;
    reports.clear();
    authorized = false;
    retryAt = 0;
    windowStarted = 0;
    attempts = 0;
    binding = value;
    bound = true;
    if (path != null && value != null) {
      try {
        if (Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)
            && Files.size(path) <= MAX_FILE_BYTES) restore(ClientSettings.read(path), value, now);
      } catch (IOException | RuntimeException ignored) {
        reports.clear();
        authorized = false;
      }
    }
    save();
  }

  private void restore(Properties stored, String value, long now) {
    if (!value.equals(stored.getProperty("binding"))) return;
    authorized = "true".equals(stored.getProperty("authorized"));
    retryAt = Math.min(now + HOUR, Math.max(0, Long.parseLong(stored.getProperty("retryAt", "0"))));
    windowStarted =
        Math.min(now, Math.max(0, Long.parseLong(stored.getProperty("windowStarted", "0"))));
    attempts = Math.max(0, Math.min(5, Integer.parseInt(stored.getProperty("attempts", "0"))));
    for (var report :
        JsonParser.parseString(stored.getProperty("reports", "[]")).getAsJsonArray()) {
      if (reports.size() == MAX_REPORTS) break;
      try {
        reports.add(DiagnosticReport.restore(report.getAsJsonObject(), Instant.ofEpochMilli(now)));
      } catch (RuntimeException ignored) {
        /* Malformed or expired entries are discarded individually. */
      }
    }
  }

  void authorize() {
    authorized = true;
    save();
  }

  boolean authorized() {
    return authorized;
  }

  int size() {
    return reports.size();
  }

  void add(JsonObject report) {
    if (reports.size() == MAX_REPORTS) reports.removeFirst();
    reports.addLast(report.deepCopy());
    save();
  }

  JsonObject next(long now) {
    expire(now);
    if (now - windowStarted >= HOUR) {
      windowStarted = now;
      attempts = 0;
    }
    if (now < retryAt || attempts >= 5) return null;
    while (!reports.isEmpty()) {
      try {
        return DiagnosticReport.restore(reports.getFirst(), Instant.ofEpochMilli(now));
      } catch (RuntimeException ignored) {
        reports.removeFirst();
        save();
      }
    }
    return null;
  }

  void expire(long now) {
    boolean changed =
        reports.removeIf(
            report -> {
              try {
                Instant occurred =
                    Instant.parse(report.getAsJsonObject("report").get("occurredAt").getAsString());
                return occurred.isBefore(
                        Instant.ofEpochMilli(now).minus(java.time.Duration.ofDays(7)))
                    || occurred.isAfter(Instant.ofEpochMilli(now).plusSeconds(300));
              } catch (RuntimeException ignored) {
                return true;
              }
            });
    if (changed) save();
  }

  void attempted() {
    attempts++;
    save();
  }

  void retry(long now, long delay) {
    retryAt = now + delay;
    save();
  }

  void remove(String id) {
    reports.removeIf(report -> report.getAsJsonObject("report").get("id").getAsString().equals(id));
    save();
  }

  void purge() {
    reports.clear();
    authorized = false;
    save();
  }

  private void save() {
    if (path == null) return;
    try {
      if (binding == null || !authorized) {
        Files.deleteIfExists(path);
        return;
      }
      Properties stored = new Properties();
      stored.setProperty("binding", binding);
      stored.setProperty("authorized", Boolean.toString(authorized));
      stored.setProperty("retryAt", Long.toString(retryAt));
      stored.setProperty("windowStarted", Long.toString(windowStarted));
      stored.setProperty("attempts", Integer.toString(attempts));
      JsonArray entries = new JsonArray();
      reports.forEach(entries::add);
      stored.setProperty("reports", entries.toString());
      ClientSettings.save(path, stored);
    } catch (IOException | RuntimeException ignored) {
      // Reporting must not turn a full/read-only disk into a second client failure.
    }
  }
}
