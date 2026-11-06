package dev.minemories.client;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.net.http.HttpRequest;
import java.util.Objects;
import java.util.function.BooleanSupplier;
import java.util.function.LongSupplier;

/**
 * Limits bytes consumed by the HTTP publisher, including retries; never runs on the game thread.
 */
final class UploadPacer {
  static final long AFK_BYTES_PER_SECOND = 512L * 1024;
  private static final int BAND_BYTES = 16384;

  interface Sleeper {
    void sleep(long nanos) throws InterruptedException;
  }

  private final long rate;
  private final BooleanSupplier allowed;
  private final LongSupplier clock;
  private final Sleeper sleeper;
  private long deadline;

  UploadPacer(long rate, BooleanSupplier allowed) {
    this(
        rate,
        allowed,
        System::nanoTime,
        nanos -> Thread.sleep(nanos / 1_000_000, (int) (nanos % 1_000_000)));
  }

  UploadPacer(long rate, BooleanSupplier allowed, LongSupplier clock, Sleeper sleeper) {
    if (rate < 1 || rate > 1024L * 1024 * 1024)
      throw new IllegalArgumentException("Invalid upload rate");
    this.rate = rate;
    this.allowed = Objects.requireNonNull(allowed);
    this.clock = Objects.requireNonNull(clock);
    this.sleeper = Objects.requireNonNull(sleeper);
    deadline = clock.getAsLong();
  }

  void check() throws InterruptedIOException {
    if (Thread.currentThread().isInterrupted() || !allowed.getAsBoolean())
      throw new InterruptedIOException(
          "Envoi AFK arrêté : contexte ou réglages modifiés. Le fichier local est conservé.");
  }

  private synchronized void pace(int amount) throws IOException {
    check();
    deadline =
        Math.max(deadline, clock.getAsLong()) + (long) ((double) amount * 1_000_000_000 / rate);
    while (true) {
      check();
      long remaining = deadline - clock.getAsLong();
      if (remaining <= 0) return;
      try {
        sleeper.sleep(Math.min(remaining, 50_000_000));
      } catch (InterruptedException error) {
        Thread.currentThread().interrupt();
        throw new InterruptedIOException("Envoi AFK interrompu.");
      }
    }
  }

  HttpRequest.BodyPublisher body(byte[] data) {
    return HttpRequest.BodyPublishers.fromPublisher(
        HttpRequest.BodyPublishers.ofInputStream(() -> stream(data)), data.length);
  }

  InputStream stream(byte[] data) {
    return new InputStream() {
      private final ByteArrayInputStream input = new ByteArrayInputStream(data);

      @Override
      public int read() throws IOException {
        check();
        int value = input.read();
        if (value >= 0) pace(1);
        return value;
      }

      @Override
      public int read(byte[] buffer, int offset, int length) throws IOException {
        Objects.checkFromIndexSize(offset, length, buffer.length);
        if (length == 0) return 0;
        check();
        int amount = input.read(buffer, offset, Math.min(length, BAND_BYTES));
        if (amount > 0) pace(amount);
        return amount;
      }
    };
  }
}
