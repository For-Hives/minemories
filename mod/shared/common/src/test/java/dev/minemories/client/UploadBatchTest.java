package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class UploadBatchTest {
  private static CaptureHistory.Entry entry(String id, boolean uploaded, boolean readable) {
    return new CaptureHistory.Entry(
        id, Path.of(id, "capture.glb"), Instant.EPOCH, 10, "W", readable, uploaded, false, "");
  }

  private static UploadFailure failure(UploadFailure.Kind kind) {
    return new UploadFailure(kind, 30, "boom");
  }

  @Test
  void sendsOnlyUnsentReadableCapturesOneAtATime() {
    var batch = new UploadBatch();
    assertTrue(
        batch.start(
            List.of(
                entry("a", false, true),
                entry("b", true, true),
                entry("c", false, false),
                entry("d", false, true))));
    assertEquals(2, batch.total());
    assertEquals("a", batch.next().id());
    assertNull(batch.next(), "nothing starts while one is in flight");
    assertTrue(batch.inFlight());
    batch.succeeded();
    assertEquals(2, batch.position());
    assertEquals("d", batch.next().id());
    batch.succeeded();
    assertNull(batch.next());
    assertEquals(UploadBatch.State.DONE, batch.state());
    assertFalse(batch.running());
    assertEquals(2, batch.sent());
    assertEquals(0, batch.failed());
  }

  @Test
  void startingTwiceWhileRunningIsIgnoredAndEmptyRunsStayIdle() {
    var batch = new UploadBatch();
    assertFalse(batch.start(List.of(entry("a", true, true))));
    assertEquals(UploadBatch.State.IDLE, batch.state());
    assertTrue(batch.start(List.of(entry("a", false, true), entry("b", false, true))));
    assertFalse(batch.start(List.of(entry("x", false, true))));
    assertEquals(2, batch.total());
    assertEquals("a", batch.next().id());
    assertFalse(batch.start(List.of(entry("y", false, true))));
  }

  @Test
  void ordinaryFailuresAreCountedAndTheRunContinues() {
    var batch = new UploadBatch();
    batch.start(List.of(entry("a", false, true), entry("b", false, true)));
    batch.next();
    batch.failed(failure(UploadFailure.Kind.OTHER));
    assertTrue(batch.running());
    batch.next();
    batch.succeeded();
    assertNull(batch.next());
    assertEquals(1, batch.sent());
    assertEquals(1, batch.failed());
    assertEquals("boom", batch.lastError());
    assertNull(batch.stoppedBy());
    assertEquals(0, batch.skipped());
    assertTrue(batch.start(List.of(entry("c", false, true))), "a finished run can be repeated");
    assertEquals(0, batch.failed());
  }

  @Test
  void rateLimitQuotaAndAuthorizationStopTheRunWithoutTouchingTheRest() {
    for (var kind :
        List.of(
            UploadFailure.Kind.RATE_LIMITED,
            UploadFailure.Kind.QUOTA,
            UploadFailure.Kind.UNAUTHORIZED)) {
      var batch = new UploadBatch();
      batch.start(
          List.of(entry("a", false, true), entry("b", false, true), entry("c", false, true)));
      batch.next();
      batch.succeeded();
      batch.next();
      batch.failed(failure(kind));
      assertEquals(UploadBatch.State.STOPPED, batch.state());
      assertEquals(kind, batch.stoppedBy().kind());
      assertEquals(1, batch.sent());
      assertEquals(0, batch.failed());
      assertEquals(2, batch.skipped(), "the refused capture and the untouched one are both left");
      assertNull(batch.next());
    }
  }

  @Test
  void cancelLetsTheCaptureInFlightFinish() {
    var batch = new UploadBatch();
    batch.start(List.of(entry("a", false, true), entry("b", false, true)));
    batch.next();
    batch.cancel();
    assertEquals(1, batch.skipped());
    batch.succeeded();
    assertEquals(1, batch.sent());
    assertNull(batch.next());
    batch.cancel();
    batch.succeeded();
    batch.failed(failure(UploadFailure.Kind.OTHER));
    assertEquals(1, batch.sent());
    assertEquals(UploadBatch.State.STOPPED, batch.state());
  }

  @Test
  void cancelledRunStillCountsOrdinaryFailureOfTheCaptureInFlight() {
    var batch = new UploadBatch();
    batch.start(List.of(entry("a", false, true)));
    batch.next();
    batch.cancel();
    batch.failed(failure(UploadFailure.Kind.OTHER));
    assertEquals(1, batch.failed());
    batch.cancel();
    assertEquals(0, new UploadBatch().skipped());
  }

  @Test
  void retryAfterIsParsedAndBounded() {
    assertEquals(45, UploadFailure.parseRetryAfter(" 45 "));
    assertEquals(1, UploadFailure.parseRetryAfter("0"));
    assertEquals(UploadFailure.MAX_RETRY_SECONDS, UploadFailure.parseRetryAfter("999999"));
    assertEquals(UploadFailure.DEFAULT_RETRY_SECONDS, UploadFailure.parseRetryAfter(null));
    assertEquals(
        UploadFailure.DEFAULT_RETRY_SECONDS,
        UploadFailure.parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT"));
    assertFalse(UploadFailure.Kind.OTHER.stopsBatch());
  }
}
