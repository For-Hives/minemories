package dev.minemories.neoforge;

import java.util.Objects;
import java.util.function.LongSupplier;

/** A renderer is indivisible. Stop starting work after its frame's time or item budget is spent. */
final class CaptureFrameBudget {
  private final LongSupplier clock;
  private final long started;
  private final long nanos;
  private final int maximum;
  private int admitted;

  CaptureFrameBudget(LongSupplier clock, long nanos, int maximum) {
    if (nanos < 1 || nanos > 50_000_000 || maximum < 1)
      throw new IllegalArgumentException("Invalid capture frame budget");
    this.clock = Objects.requireNonNull(clock);
    this.started = clock.getAsLong();
    this.nanos = nanos;
    this.maximum = maximum;
  }

  boolean admit() {
    if (admitted == maximum || clock.getAsLong() - started >= nanos) return false;
    admitted++;
    return true;
  }

  long elapsedNanos() {
    return clock.getAsLong() - started;
  }
}
