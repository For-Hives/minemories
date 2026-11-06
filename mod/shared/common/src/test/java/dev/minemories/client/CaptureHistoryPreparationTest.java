package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CaptureHistoryPreparationTest {
  @TempDir Path directory;
  private static final Instant TIME = Instant.parse("2026-10-14T12:00:00Z");

  @Test
  void completionMetadataIsEvaluatedAfterTheGlbWriter() throws Exception {
    AtomicBoolean written = new AtomicBoolean();
    Path saved =
        CaptureHistory.savePrepared(
            directory,
            TIME,
            () -> {
              assertTrue(written.get());
              return "{\"capturedAt\":\""
                  + TIME
                  + "\",\"captureFinishedAt\":\"2026-10-14T12:00:01Z\"}";
            },
            file -> {
              Files.writeString(file, "complete");
              written.set(true);
            });
    assertEquals(
        "2026-10-14T12:00:01Z",
        CaptureHistory.metadata(saved).get("captureFinishedAt").getAsString());
  }

  @Test
  void interruptionBeforeCommitPreservesTheLastCompleteFileAndCleansStaging() throws Exception {
    Path previous =
        CaptureHistory.save(directory, TIME, "{}", file -> Files.writeString(file, "previous"));
    try {
      assertThrows(
          IOException.class,
          () ->
              CaptureHistory.savePrepared(
                  directory,
                  TIME.plusSeconds(1),
                  () -> "{}",
                  file -> {
                    Files.writeString(file, "unfinished");
                    Thread.currentThread().interrupt();
                  }));
      assertTrue(Thread.currentThread().isInterrupted());
    } finally {
      Thread.interrupted();
    }
    assertEquals(previous, CaptureHistory.latest(directory));
    assertEquals("previous", Files.readString(directory.resolve("capture.glb")));
    try (var paths = Files.list(directory.resolve("history"))) {
      assertTrue(
          paths.noneMatch(
              path ->
                  java.util.Objects.requireNonNull(path.getFileName())
                      .toString()
                      .startsWith(".pending-")));
    }
    assertThrows(
        IOException.class,
        () ->
            CaptureHistory.savePrepared(
                directory,
                TIME.plusSeconds(2),
                () -> "x".repeat(CaptureHistory.MAX_METADATA_BYTES + 1),
                file -> Files.writeString(file, "full glb")));
    assertEquals(previous, CaptureHistory.latest(directory));
  }

  @Test
  void historyReadersDoNotWaitForABackgroundWriterToFinishItsGlb() throws Exception {
    Path previous =
        CaptureHistory.save(directory, TIME, "{}", file -> Files.writeString(file, "previous"));
    CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
    var writing =
        CompletableFuture.runAsync(
            () -> {
              try {
                CaptureHistory.savePrepared(
                    directory,
                    TIME.plusSeconds(1),
                    () -> "{}",
                    file -> {
                      entered.countDown();
                      try {
                        if (!release.await(10, TimeUnit.SECONDS))
                          throw new IOException("Fixture release timed out");
                      } catch (InterruptedException error) {
                        Thread.currentThread().interrupt();
                        throw new IOException(error);
                      }
                      Files.writeString(file, "new");
                    });
              } catch (IOException error) {
                throw new java.io.UncheckedIOException(error);
              }
            });
    try {
      assertTrue(entered.await(5, TimeUnit.SECONDS));
      var reading =
          CompletableFuture.supplyAsync(
              () -> {
                try {
                  assertEquals(previous, CaptureHistory.latest(directory));
                  return CaptureHistory.list(directory, null, 4).entries().size();
                } catch (IOException error) {
                  throw new java.io.UncheckedIOException(error);
                }
              });
      assertEquals(1, reading.get(2, TimeUnit.SECONDS));
    } finally {
      release.countDown();
      writing.get(5, TimeUnit.SECONDS);
    }
  }
}
