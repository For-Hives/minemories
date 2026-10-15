package dev.minemories.neoforge;

/** The mixin must always return to vanilla's original crash reporting and exit behavior. */
public final class DiagnosticCrashHook {
  private DiagnosticCrashHook() {}

  public static void record(Throwable error) {
    try {
      PairingClient.reportCrash(error);
    } catch (Throwable ignored) {
      /* Even allocation/disk failures must preserve the original crash. */
    }
  }
}
