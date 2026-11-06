package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class PairingReminderTest {
  private static int countReminders(PairingReminder reminder, int ticks) {
    int count = 0;
    for (int i = 0; i < ticks; i++) {
      if (reminder.tick(true, false, true)) count++;
    }
    return count;
  }

  @Test
  void noReminderBeforeTheDelayAndExactlyOneAtTheDelay() {
    var reminder = new PairingReminder();
    for (int i = 1; i < PairingReminder.DELAY_TICKS; i++) {
      assertFalse(reminder.tick(true, false, true), "tick " + i);
    }
    assertTrue(reminder.tick(true, false, true));
  }

  @Test
  void neverRemindsTwiceInTheSameWorld() {
    var reminder = new PairingReminder();
    assertEquals(1, countReminders(reminder, 5 * PairingReminder.DELAY_TICKS));
    assertEquals(0, countReminders(reminder, 1000));
  }

  @Test
  void pairingDuringTheCountdownCancelsTheReminder() {
    var reminder = new PairingReminder();
    for (int i = 0; i < 50; i++) reminder.tick(true, false, true);
    assertFalse(reminder.tick(true, true, true));
    assertEquals(0, countReminders(reminder, 2 * PairingReminder.DELAY_TICKS));
  }

  @Test
  void disablingDuringTheCountdownCancelsTheReminder() {
    var reminder = new PairingReminder();
    for (int i = 0; i < 50; i++) reminder.tick(true, false, true);
    assertFalse(reminder.tick(true, false, false));
    assertEquals(0, countReminders(reminder, 2 * PairingReminder.DELAY_TICKS));
  }

  @Test
  void leavingTheWorldResetsSoANewJoinRemindsAgain() {
    var reminder = new PairingReminder();
    for (int i = 0; i < 50; i++) reminder.tick(true, false, true);
    assertFalse(reminder.tick(false, false, true));
    assertEquals(1, countReminders(reminder, PairingReminder.DELAY_TICKS));
    assertFalse(reminder.tick(false, false, true));
    assertEquals(1, countReminders(reminder, PairingReminder.DELAY_TICKS));
  }

  @Test
  void dimensionChangeKeepsTheSameJoin() {
    var reminder = new PairingReminder();
    for (int i = 0; i < PairingReminder.DELAY_TICKS; i++) reminder.tick(true, false, true);
    assertEquals(0, countReminders(reminder, PairingReminder.DELAY_TICKS));
  }

  @Test
  void alreadyPairedAtJoinNeverReminds() {
    var reminder = new PairingReminder();
    assertEquals(0, countWith(reminder, true, true, 3 * PairingReminder.DELAY_TICKS));
  }

  @Test
  void disabledAtJoinNeverReminds() {
    var reminder = new PairingReminder();
    assertEquals(0, countWith(reminder, false, false, 3 * PairingReminder.DELAY_TICKS));
  }

  @Test
  void stayingInWorldForThousandsOfTicksProducesASingleReminder() {
    var reminder = new PairingReminder();
    assertEquals(1, countReminders(reminder, 5000));
  }

  private static int countWith(
      PairingReminder reminder, boolean paired, boolean enabled, int ticks) {
    int count = 0;
    for (int i = 0; i < ticks; i++) {
      if (reminder.tick(true, paired, enabled)) count++;
    }
    return count;
  }
}
