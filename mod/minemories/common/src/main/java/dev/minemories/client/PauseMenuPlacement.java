package dev.minemories.client;

import java.util.List;

final class PauseMenuPlacement {
  static final int BUTTON_WIDTH = 104;
  static final int BUTTON_HEIGHT = 20;
  private static final int MARGIN = 8;
  private static final int GAP = 3;

  private PauseMenuPlacement() {}

  record Rect(int x, int y, int width, int height) {
    boolean overlaps(Rect other) {
      return x < other.x + other.width + GAP
          && x + width + GAP > other.x
          && y < other.y + other.height + GAP
          && y + height + GAP > other.y;
    }
  }

  static Rect find(int width, int height, List<Rect> occupied) {
    int buttonWidth = Math.min(BUTTON_WIDTH, width - 2 * MARGIN);
    if (buttonWidth < 64 || height < BUTTON_HEIGHT + 2 * MARGIN) return null;

    int right = width - buttonWidth - MARGIN;
    int bottom = height - BUTTON_HEIGHT - MARGIN;
    int[] columns = {right, MARGIN};
    int[] ends = {MARGIN, bottom};
    for (int y : ends) {
      for (int x : columns) {
        Rect candidate = new Rect(x, y, buttonWidth, BUTTON_HEIGHT);
        if (available(candidate, width, occupied)) return candidate;
      }
    }
    for (int y = MARGIN + 24; y < bottom; y += 24) {
      for (int x : columns) {
        Rect candidate = new Rect(x, y, buttonWidth, BUTTON_HEIGHT);
        if (available(candidate, width, occupied)) return candidate;
      }
    }
    return null;
  }

  private static boolean available(Rect candidate, int screenWidth, List<Rect> occupied) {
    // Keep the centered Minecraft pause title readable on narrow GUI scales.
    if (candidate.y < 56
        && candidate.y + candidate.height > 34
        && candidate.x < screenWidth / 2 + 65
        && candidate.x + candidate.width > screenWidth / 2 - 65) return false;
    for (Rect widget : occupied) {
      if (candidate.overlaps(widget)) return false;
    }
    return true;
  }
}
