package dev.minemories.client;

/** The mixin must always return to vanilla's original crash reporting and exit behavior. */
public final class DiagnosticCrashHook {
  private DiagnosticCrashHook() {}

  /** A failure the game survived: reported like a crash when diagnostics are on, never thrown. */
  public static void recordHandled(Throwable error) {
    try {
      PairingClient.reportHandled(error);
    } catch (Throwable ignored) {
      /* Reporting must never turn a minor error into a worse one. */
    }
  }

  public static void record(Throwable error) {
    try {
      PairingClient.reportCrash(error);
    } catch (Throwable ignored) {
      /* Even allocation/disk failures must preserve the original crash. */
    }
  }
}
