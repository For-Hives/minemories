package dev.minemories.client;

/** The values a numeric setting can take on its slider, and how to show them. */
final class SettingSteps {
  /** Minutes without input before an automatic memory. */
  static final int[] IDLE_MINUTES = {1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 240, 720, 1440};

  /** Minutes between two automatic memories. */
  static final int[] INTERVAL_MINUTES = {
    1, 5, 10, 15, 30, 60, 90, 120, 180, 240, 360, 480, 720, 1440, 2880, 4320, 10080
  };

  /** Blocks around the player; also the stored value used by the radius command. */
  static final int[] RADIUS = {2, 4, 8, 16, 24, 32, 48, 64, 96, 128};

  /** Blocks above (or below) the player; 0 lets the mod decide. */
  static final int[] VERTICAL = {0, 8, 16, 24, 32, 48, 64, 96, 128, 192, 256};

  private SettingSteps() {}

  /** Index of the step closest to {@code value}; the first one when {@code steps} is empty-safe. */
  static int nearestIndex(int[] steps, int value) {
    int best = 0;
    for (int i = 1; i < steps.length; i++) {
      if (Math.abs(steps[i] - value) < Math.abs(steps[best] - value)) best = i;
    }
    return best;
  }

  /** Slider position (0..1) of step {@code index}. */
  static double position(int[] steps, int index) {
    return steps.length < 2 ? 0 : (double) index / (steps.length - 1);
  }

  /** Index of the step a slider position (0..1) selects. */
  static int indexAt(int[] steps, double position) {
    int index = (int) Math.round(Math.max(0, Math.min(1, position)) * (steps.length - 1));
    return Math.max(0, Math.min(steps.length - 1, index));
  }

  /** 90 -> "1 h 30", 1440 -> "1 d", 5 -> "5 min". */
  static String duration(int minutes) {
    if (minutes % 1440 == 0) return minutes / 1440 + " d";
    if (minutes < 60) return minutes + " min";
    if (minutes % 60 == 0) return minutes / 60 + " h";
    return minutes / 60 + " h " + minutes % 60;
  }
}
