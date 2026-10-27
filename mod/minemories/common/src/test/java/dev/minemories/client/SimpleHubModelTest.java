package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

class SimpleHubModelTest {
  private static SimpleHubModel.Input input(boolean paired, boolean inWorld, boolean busy) {
    return new SimpleHubModel.Input(paired, inWorld, busy, true, 6, true);
  }

  @Test
  void connectNeedsUnpairedIdleSixDigitCode() {
    assertTrue(SimpleHubModel.actions(input(false, false, false)).connectEnabled());
    assertFalse(SimpleHubModel.actions(input(true, false, false)).connectEnabled());
    assertFalse(SimpleHubModel.actions(input(false, false, true)).connectEnabled());
    for (int length = 0; length <= 6; length++) {
      var in = new SimpleHubModel.Input(false, true, false, true, length, true);
      assertEquals(length == 6, SimpleHubModel.actions(in).connectEnabled(), "length " + length);
    }
  }

  @Test
  void codeLengthIsClampedBeforeUse() {
    var negative = new SimpleHubModel.Input(false, true, false, true, -3, true);
    assertFalse(SimpleHubModel.actions(negative).connectEnabled());
    var tooLong = new SimpleHubModel.Input(false, true, false, true, 9, true);
    assertTrue(SimpleHubModel.actions(tooLong).connectEnabled());
    var extreme = new SimpleHubModel.Input(false, true, false, true, Integer.MAX_VALUE, true);
    assertTrue(SimpleHubModel.actions(extreme).connectEnabled());
    var minimum = new SimpleHubModel.Input(false, true, false, true, Integer.MIN_VALUE, true);
    assertFalse(SimpleHubModel.actions(minimum).connectEnabled());
  }

  @Test
  void codeFieldAndHelpFollowPairingAndOfficialApi() {
    var unpairedOfficial =
        SimpleHubModel.actions(new SimpleHubModel.Input(false, false, false, true, 0, true));
    assertTrue(unpairedOfficial.showCodeField());
    assertTrue(unpairedOfficial.showCodeHelp());
    var unpairedCustom =
        SimpleHubModel.actions(new SimpleHubModel.Input(false, false, false, true, 0, false));
    assertTrue(unpairedCustom.showCodeField());
    assertFalse(unpairedCustom.showCodeHelp());
    var paired =
        SimpleHubModel.actions(new SimpleHubModel.Input(true, false, false, true, 0, true));
    assertFalse(paired.showCodeField());
    assertFalse(paired.showCodeHelp());
  }

  @Test
  void captureNeedsWorldAndIdleButNotPairing() {
    for (boolean paired : new boolean[] {false, true}) {
      for (boolean inWorld : new boolean[] {false, true}) {
        for (boolean busy : new boolean[] {false, true}) {
          var actions = SimpleHubModel.actions(input(paired, inWorld, busy));
          assertEquals(
              inWorld && !busy, actions.captureEnabled(), "capture " + paired + inWorld + busy);
          assertEquals(!busy, actions.autoEnabled(), "auto " + paired + inWorld + busy);
          assertTrue(actions.memoriesEnabled());
        }
      }
    }
  }

  @Test
  void statusKeysFollowPairing() {
    assertEquals(
        "minemories.hub.connected", SimpleHubModel.statusTitleKey(input(true, false, false)));
    assertEquals(
        "minemories.hub.not_connected", SimpleHubModel.statusTitleKey(input(false, true, true)));
    assertEquals(
        "minemories.hub.connected_hint", SimpleHubModel.statusHintKey(input(true, true, false)));
    assertEquals(
        "minemories.hub.not_connected_hint",
        SimpleHubModel.statusHintKey(input(false, false, false)));
  }

  @Test
  void autoLabelFollowsAutoPhotos() {
    assertEquals(
        "minemories.hub.auto_on",
        SimpleHubModel.autoLabelKey(new SimpleHubModel.Input(false, false, false, true, 0, true)));
    assertEquals(
        "minemories.hub.auto_off",
        SimpleHubModel.autoLabelKey(new SimpleHubModel.Input(false, false, false, false, 0, true)));
  }

  @Test
  void footerPriorityIsBusyThenWorldThenPairing() {
    for (boolean paired : new boolean[] {false, true}) {
      for (boolean inWorld : new boolean[] {false, true}) {
        for (boolean busy : new boolean[] {false, true}) {
          String expected;
          if (busy) {
            expected = "minemories.hub.busy";
          } else if (!inWorld) {
            expected = "minemories.hub.need_world";
          } else if (!paired) {
            expected = "minemories.hub.take_local_hint";
          } else {
            expected = "minemories.hub.ready";
          }
          assertEquals(
              expected,
              SimpleHubModel.footerKey(input(paired, inWorld, busy)),
              "footer " + paired + inWorld + busy);
        }
      }
    }
  }

  @Test
  void validCodeAcceptsOnlyExactlySixAsciiDigits() {
    assertTrue(SimpleHubModel.validCode("012345"));
    assertTrue(SimpleHubModel.validCode("000000"));
    assertFalse(SimpleHubModel.validCode("12345"));
    assertFalse(SimpleHubModel.validCode("1234567"));
    assertFalse(SimpleHubModel.validCode("12345a"));
    assertFalse(SimpleHubModel.validCode("1234 6"));
    assertFalse(SimpleHubModel.validCode("１２３４５６"));
    assertFalse(SimpleHubModel.validCode(""));
  }
}
