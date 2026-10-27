package dev.minemories.client;

/** Reminds an unpaired player once per world join, after a fixed number of in-world ticks. */
final class PairingReminder {
  static final int DELAY_TICKS = 100;

  private boolean joined;
  private boolean armed;
  private int ticks;

  boolean tick(boolean inWorld, boolean paired, boolean enabled) {
    if (!inWorld) {
      joined = false;
      armed = false;
      ticks = 0;
      return false;
    }
    if (!joined) {
      joined = true;
      armed = true;
      ticks = 0;
    }
    if (paired || !enabled) armed = false;
    if (!armed) return false;
    if (++ticks < DELAY_TICKS) return false;
    armed = false;
    return true;
  }
}
