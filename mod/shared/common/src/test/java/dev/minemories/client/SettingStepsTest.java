package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class SettingStepsTest {
  @Test
  void nearestIndexSnapsOddStoredValuesToAStep() {
    assertEquals(0, SettingSteps.nearestIndex(SettingSteps.RADIUS, 1));
    assertEquals(5, SettingSteps.nearestIndex(SettingSteps.RADIUS, 32));
    assertEquals(9, SettingSteps.nearestIndex(SettingSteps.RADIUS, 5000));
  }

  @Test
  void positionAndIndexRoundTripAndClamp() {
    int[] steps = SettingSteps.IDLE_MINUTES;
    for (int i = 0; i < steps.length; i++) {
      assertEquals(i, SettingSteps.indexAt(steps, SettingSteps.position(steps, i)));
    }
    assertEquals(0, SettingSteps.indexAt(steps, -3));
    assertEquals(steps.length - 1, SettingSteps.indexAt(steps, 7));
    assertEquals(0, SettingSteps.position(new int[] {4}, 0));
  }

  @Test
  void durationsReadNaturally() {
    assertEquals("5 min", SettingSteps.duration(5));
    assertEquals("2 h", SettingSteps.duration(120));
    assertEquals("1 h 30", SettingSteps.duration(90));
    assertEquals("1 d", SettingSteps.duration(1440));
  }

  @Test
  void everyStepIsAValidSetting() {
    for (int value : SettingSteps.IDLE_MINUTES)
      assertEquals(value, new ClientSettings.AfkOptions(value, 5, 8).idleMinutes());
    for (int value : SettingSteps.INTERVAL_MINUTES)
      assertEquals(value, new ClientSettings.AfkOptions(5, value, 8).intervalMinutes());
    for (int value : SettingSteps.RADIUS)
      assertEquals(value, new ClientSettings.ManualSize(value, 0, 0).radius());
    for (int value : SettingSteps.VERTICAL)
      assertEquals(value, new ClientSettings.ManualSize(8, value, value).up());
  }
}
