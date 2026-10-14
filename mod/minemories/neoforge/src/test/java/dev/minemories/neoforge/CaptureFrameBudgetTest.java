package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.*;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class CaptureFrameBudgetTest {
  @Test
  void slowWorkStopsNewAdmissionsEvenIfTheItemCapWasNotReached() {
    AtomicLong clock = new AtomicLong(100);
    var budget = new CaptureFrameBudget(clock::get, 10, 100);
    assertTrue(budget.admit());
    clock.addAndGet(11);
    assertFalse(budget.admit());
    assertEquals(11, budget.elapsedNanos());
  }

  @Test
  void fixedItemBudgetBoundsAFrameEvenWhenTheClockDoesNotAdvance() {
    var budget = new CaptureFrameBudget(() -> 100, 10, 2);
    assertTrue(budget.admit());
    assertTrue(budget.admit());
    assertFalse(budget.admit());
    assertFalse(budget.admit());
    assertThrows(IllegalArgumentException.class, () -> new CaptureFrameBudget(() -> 0, 0, 1));
    assertThrows(
        IllegalArgumentException.class, () -> new CaptureFrameBudget(() -> 0, 50_000_001, 1));
    assertThrows(IllegalArgumentException.class, () -> new CaptureFrameBudget(() -> 0, 1, 0));
  }

  @Test
  void nanoTimeWrapDoesNotRestartTheBudget() {
    AtomicLong clock = new AtomicLong(Long.MAX_VALUE - 5);
    var budget = new CaptureFrameBudget(clock::get, 10, 100);
    clock.addAndGet(9);
    assertTrue(budget.admit());
    clock.incrementAndGet();
    assertFalse(budget.admit());
  }
}
