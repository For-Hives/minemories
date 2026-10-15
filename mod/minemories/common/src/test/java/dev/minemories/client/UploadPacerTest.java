package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.io.InterruptedIOException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class UploadPacerTest {
  @Test
  void bandsAndRetriesHaveNoAccumulatedIdleBurst() throws Exception {
    var clock = new AtomicLong();
    var pacer =
        new UploadPacer(UploadPacer.AFK_BYTES_PER_SECOND, () -> true, clock::get, clock::addAndGet);
    byte[] data = new byte[65536], buffer = new byte[data.length];
    try (var input = pacer.stream(data)) {
      assertEquals(0, input.read(buffer, 0, 0));
      assertEquals(16384, input.read(buffer));
      assertEquals(31_250_000, clock.get());
      clock.addAndGet(5_000_000_000L);
      assertEquals(16384, input.read(buffer));
      assertEquals(5_062_500_000L, clock.get());
      assertEquals(16384, input.read(buffer));
      assertEquals(16384, input.read(buffer));
      assertEquals(-1, input.read());
    }
    long before = clock.get();
    try (var retry = pacer.stream(data)) {
      assertEquals(16384, retry.read(buffer));
    }
    assertEquals(31_250_000, clock.get() - before);
    assertEquals(data.length, pacer.body(data).contentLength());
  }

  @Test
  void contextChangesDuringWaitingCancelBeforePublishingBytes() throws Exception {
    var allowed = new AtomicBoolean(true);
    var clock = new AtomicLong();
    var pacer =
        new UploadPacer(
            1024,
            allowed::get,
            clock::get,
            nanos -> {
              clock.addAndGet(nanos);
              allowed.set(false);
            });
    try (var input = pacer.stream(new byte[8192])) {
      assertThrows(
          InterruptedIOException.class, () -> assertEquals(8192, input.read(new byte[8192])));
      assertThrows(InterruptedIOException.class, pacer::check);
    }
  }

  @Test
  void interruptionAndInvalidArgumentsAreRejected() throws Exception {
    assertThrows(IllegalArgumentException.class, () -> new UploadPacer(0, () -> true));
    var pacer =
        new UploadPacer(
            1024,
            () -> true,
            () -> 0,
            nanos -> {
              throw new InterruptedException();
            });
    try (var input = pacer.stream(new byte[] {1})) {
      assertThrows(InterruptedIOException.class, input::read);
      assertTrue(Thread.interrupted());
    }
  }
}
