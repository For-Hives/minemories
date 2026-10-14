package dev.minemories.neoforge;

import java.util.function.LongSupplier;

final class UploadPacing {
  interface Sleep {
    void millis(long millis) throws InterruptedException;
  }

  private final long bytesPerSecond;
  private final LongSupplier clock;
  private final Sleep sleep;
  private long deadline;

  UploadPacing(long bytesPerSecond, LongSupplier clock, Sleep sleep) {
    if (bytesPerSecond < 1) throw new IllegalArgumentException("Invalid upload rate");
    this.bytesPerSecond = bytesPerSecond;
    this.clock = clock;
    this.sleep = sleep;
    deadline = clock.getAsLong();
  }

  void await(long bytes) throws InterruptedException {
    if (bytes < 0 || bytes > ChunkedUploader.CHUNK_BYTES)
      throw new IllegalArgumentException("Invalid upload packet size");
    long now = clock.getAsLong();
    deadline = now + Math.max(0, deadline - now) + bytes * 1_000_000_000L / bytesPerSecond;
    long remaining;
    while ((remaining = deadline - clock.getAsLong()) > 0) {
      sleep.millis(Math.min(100, (remaining + 999_999) / 1_000_000));
    }
  }
}
