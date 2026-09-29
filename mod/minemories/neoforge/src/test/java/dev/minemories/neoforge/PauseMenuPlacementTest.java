package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;
import org.junit.jupiter.api.Test;

class PauseMenuPlacementTest {
  @Test
  void avoidsVanillaAndModdedButtons() {
    var occupied =
        List.of(
            new PauseMenuPlacement.Rect(208, 8, 104, 20),
            new PauseMenuPlacement.Rect(8, 8, 104, 20),
            new PauseMenuPlacement.Rect(58, 70, 204, 20),
            new PauseMenuPlacement.Rect(58, 96, 204, 20),
            new PauseMenuPlacement.Rect(208, 212, 104, 20));
    var spot = PauseMenuPlacement.find(320, 240, occupied);

    assertEquals(new PauseMenuPlacement.Rect(8, 212, 104, 20), spot);
    for (var widget : occupied) {
      assertFalse(spot.overlaps(widget));
    }
  }

  @Test
  void doesNotCoverTitleOrExistingWidgetsWhenNoSpaceRemains() {
    var occupied =
        List.of(
            new PauseMenuPlacement.Rect(0, 0, 320, 214),
            new PauseMenuPlacement.Rect(0, 212, 320, 28));
    assertNull(PauseMenuPlacement.find(320, 240, occupied));
  }

  @Test
  void fitsTopRightWhenThereIsRoom() {
    var spot = PauseMenuPlacement.find(640, 360, List.of());
    assertEquals(new PauseMenuPlacement.Rect(528, 8, 104, 20), spot);
  }

  @Test
  void rejectsScreensThatCannotFitAReadableButton() {
    assertNull(PauseMenuPlacement.find(79, 240, List.of()));
    assertNull(PauseMenuPlacement.find(320, 35, List.of()));
  }

  @Test
  void shrinksButtonToFitNarrowScreens() {
    assertEquals(
        new PauseMenuPlacement.Rect(8, 8, 64, 20), PauseMenuPlacement.find(80, 240, List.of()));
  }

  @Test
  void touchingWidgetsStillLeaveTheRequiredGap() {
    var candidate = new PauseMenuPlacement.Rect(528, 8, 104, 20);
    assertFalse(candidate.overlaps(new PauseMenuPlacement.Rect(635, 8, 20, 20)));
    assertEquals(
        new PauseMenuPlacement.Rect(8, 8, 104, 20),
        PauseMenuPlacement.find(640, 360, List.of(new PauseMenuPlacement.Rect(630, 8, 20, 20))));
  }
}
