package dev.minemories.client;

/** GPU renderer compatibility applies only while collecting one model, never between AFK steps. */
public final class CaptureRenderScope {
  private static final ThreadLocal<Boolean> CAPTURING = new ThreadLocal<>();

  private CaptureRenderScope() {}

  public static boolean active() {
    return Boolean.TRUE.equals(CAPTURING.get());
  }

  static void render(Runnable renderer) {
    Boolean previous = CAPTURING.get();
    CAPTURING.set(Boolean.TRUE);
    try {
      renderer.run();
    } finally {
      if (previous == null) CAPTURING.remove();
      else CAPTURING.set(previous);
    }
  }
}
