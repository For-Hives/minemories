package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.*;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class UploadPacingTest {
  @Test
  void packetsAndRetriesArePacedWithoutAccumulatingIdleCredit() throws Exception {
    var clock = new AtomicLong();
    var waits = new AtomicLong();
    var pacing =
        new UploadPacing(
            1024 * 1024,
            clock::get,
            millis -> {
              assertTrue(millis <= 100);
              waits.addAndGet(millis);
              clock.addAndGet(millis * 1_000_000);
            });
    pacing.await(ChunkedUploader.CHUNK_BYTES);
    assertEquals(4000, waits.get());
    pacing.await(ChunkedUploader.CHUNK_BYTES);
    assertEquals(8000, waits.get());
    clock.addAndGet(60_000_000_000L);
    pacing.await(1024 * 1024);
    assertEquals(9000, waits.get());
    pacing.await(0);
    assertEquals(9000, waits.get());
  }

  @Test
  void interruptionStopsTheWaitAndInvalidSizesAreRejected() {
    var pacing =
        new UploadPacing(
            1,
            () -> 0,
            millis -> {
              throw new InterruptedException();
            });
    assertThrows(InterruptedException.class, () -> pacing.await(1));
    assertThrows(IllegalArgumentException.class, () -> pacing.await(-1));
    assertThrows(
        IllegalArgumentException.class, () -> pacing.await(ChunkedUploader.CHUNK_BYTES + 1L));
    assertThrows(IllegalArgumentException.class, () -> new UploadPacing(0, () -> 0, millis -> {}));
  }
}
