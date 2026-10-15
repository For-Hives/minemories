package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.JsonObject;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DiagnosticOutboxTest {
  @TempDir Path temporary;

  private static JsonObject report() {
    return DiagnosticReport.create(
            DiagnosticReport.Phase.CRASH,
            new DiagnosticReport.Versions("0.2.1-beta.1", "1.21.1", "neoforge-21.1.248"),
            UUID.randomUUID(),
            new IllegalStateException("private user token world path"),
            List.of(new DiagnosticReport.Breadcrumb(DiagnosticReport.Step.CLIENT_CRASHED, 0)))
        .payload();
  }

  @Test
  void survivesRestartWithoutCredentialsAndKeepsIdempotentPayload() throws Exception {
    Path path = temporary.resolve("outbox.properties");
    long now = System.currentTimeMillis();
    var queue = new DiagnosticOutbox(path);
    queue.bind("identity-hash", now);
    queue.authorize();
    JsonObject original = report();
    queue.add(original);
    var reopened = new DiagnosticOutbox(path);
    reopened.bind("identity-hash", now);
    assertTrue(reopened.authorized());
    assertEquals(original, reopened.next(now));
    assertFalse(Files.readString(path).contains("private user token"));
    try {
      assertEquals(
          "rw-------",
          java.nio.file.attribute.PosixFilePermissions.toString(
              Files.getPosixFilePermissions(path)));
    } catch (UnsupportedOperationException ignored) {
      /* POSIX permissions are not available on Windows. */
    }
    reopened.remove(original.getAsJsonObject("report").get("id").getAsString());
    assertNull(reopened.next(now));
  }

  @Test
  void mismatchedOrWithdrawnIdentityErasesThePendingReports() {
    Path path = temporary.resolve("outbox.properties");
    long now = System.currentTimeMillis();
    var queue = new DiagnosticOutbox(path);
    queue.bind("first", now);
    queue.authorize();
    queue.add(report());
    var reopened = new DiagnosticOutbox(path);
    reopened.bind("second", now);
    assertFalse(reopened.authorized());
    assertEquals(0, reopened.size());
    assertFalse(Files.exists(path));
    reopened.authorize();
    reopened.add(report());
    reopened.bind(null, now);
    assertFalse(Files.exists(path));
    assertEquals(0, reopened.size());
  }

  @Test
  void boundsPendingReportsAgeAndRetryBudgetsAcrossRestarts() {
    Path path = temporary.resolve("outbox.properties");
    long now = System.currentTimeMillis();
    var queue = new DiagnosticOutbox(path);
    queue.bind("binding", now);
    queue.authorize();
    for (int index = 0; index < 20; index++) queue.add(report());
    assertEquals(8, queue.size());
    assertNotNull(queue.next(now));
    queue.attempted();
    queue.retry(now, 60000);
    var reopened = new DiagnosticOutbox(path);
    reopened.bind("binding", now);
    assertNull(reopened.next(now + 59999));
    assertNotNull(reopened.next(now + 60000));
    for (int index = 0; index < 4; index++) reopened.attempted();
    assertNull(reopened.next(now + 60000));
    assertNotNull(reopened.next(now + 3600000));
    assertNull(reopened.next(now + 8 * 86_400_000L));
    assertEquals(0, reopened.size());
  }

  @Test
  void invalidOversizedOrModifiedSpoolsCannotUploadFreeFormFields() throws Exception {
    Path path = temporary.resolve("outbox.properties");
    long now = System.currentTimeMillis();
    var queue = new DiagnosticOutbox(path);
    queue.bind("binding", now);
    queue.authorize();
    JsonObject value = report();
    value.addProperty("secret", "private-token");
    value.getAsJsonObject("report").addProperty("message", "private-world");
    value
        .getAsJsonObject("report")
        .getAsJsonObject("exception")
        .addProperty("message", "private-server");
    queue.add(value);
    var reopened = new DiagnosticOutbox(path);
    reopened.bind("binding", now);
    String safe = reopened.next(now).toString();
    assertFalse(safe.contains("private-"));
    assertFalse(safe.contains("message"));
    assertFalse(safe.contains("secret"));
    Files.writeString(path, "x".repeat(128 * 1024 + 1));
    var oversized = new DiagnosticOutbox(path);
    oversized.bind("binding", now);
    assertFalse(oversized.authorized());
    assertFalse(Files.exists(path));
    Properties malformed = new Properties();
    malformed.setProperty("binding", "binding");
    malformed.setProperty("authorized", "true");
    malformed.setProperty("reports", "[broken");
    ClientSettings.save(path, malformed);
    var broken = new DiagnosticOutbox(path);
    broken.bind("binding", now);
    assertFalse(broken.authorized());
    assertEquals(0, broken.size());
  }

  @Test
  void expiredOrInvalidEntriesAreDroppedIndividuallyAndReadOnlyDiskDoesNotBreakTheClient()
      throws Exception {
    Path path = temporary.resolve("outbox.properties");
    long now = System.currentTimeMillis();
    var queue = new DiagnosticOutbox(path);
    queue.bind("binding", now);
    queue.authorize();
    JsonObject expired = report();
    expired
        .getAsJsonObject("report")
        .addProperty("occurredAt", Instant.ofEpochMilli(now - 8 * 86_400_000L).toString());
    queue.add(new JsonObject());
    queue.add(expired);
    queue.add(report());
    var reopened = new DiagnosticOutbox(path);
    reopened.bind("binding", now);
    assertEquals(1, reopened.size());
    assertNotNull(reopened.next(now));
    reopened.purge();
    assertFalse(reopened.authorized());
    assertFalse(Files.exists(path));
    Path blocker = temporary.resolve("file-not-directory");
    Files.writeString(blocker, "blocker");
    var memoryOnly = new DiagnosticOutbox(blocker.resolve("outbox.properties"));
    memoryOnly.bind("binding", now);
    assertDoesNotThrow(
        () -> {
          memoryOnly.authorize();
          memoryOnly.add(report());
        });
    assertEquals(1, memoryOnly.size());
  }
}
