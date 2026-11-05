package dev.minemories.compat;

/** Java 17 replacement for the Math.clamp overloads introduced in Java 21. */
public final class Clamp {
  private Clamp() {}

  public static int clamp(long value, int min, int max) {
    return (int) Math.min(max, Math.max(value, min));
  }

  public static long clamp(long value, long min, long max) {
    return Math.min(max, Math.max(value, min));
  }

  public static float clamp(float value, float min, float max) {
    return Math.min(max, Math.max(value, min));
  }

  public static double clamp(double value, double min, double max) {
    return Math.min(max, Math.max(value, min));
  }
}
