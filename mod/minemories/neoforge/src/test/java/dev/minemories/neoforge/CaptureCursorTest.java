package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class CaptureCursorTest {
  @Test
  void cellIsRepeatedWithoutResamplingOrAdvancingWhileTheWorkerCannotAcceptIt() {
    var cursor = new CaptureCursor(new CaptureBounds(-1, -2, 3, 0, 0, 3));
    AtomicInteger lookups = new AtomicInteger();
    CaptureCursor.Columns columns =
        (x, z) -> {
          lookups.incrementAndGet();
          return new CaptureCursor.Column(50, 7);
        };
    var first = cursor.peek(columns);
    assertEquals(new CaptureCursor.Cell(-1, -2, 3, 7), first);
    assertSame(first, cursor.peek(columns));
    assertEquals(1, lookups.get());
    cursor.advance();
    assertEquals(new CaptureCursor.Cell(-1, -1, 3, 7), cursor.peek(columns));
    assertEquals(1, lookups.get());
  }

  @Test
  void emptyAndMissingColumnsAreSkippedWithoutSkippingTheFollowingValidCell() {
    var cursor = new CaptureCursor(new CaptureBounds(0, 0, 0, 2, 1, 1));
    List<CaptureCursor.Cell> cells = new ArrayList<>();
    while (!cursor.done()) {
      var cell =
          cursor.peek((x, z) -> x == 0 ? null : new CaptureCursor.Column(x == 1 ? -1 : 1, 10));
      if (cell != null) {
        cells.add(cell);
        cursor.advance();
      }
    }
    assertEquals(
        List.of(
            new CaptureCursor.Cell(2, 0, 0, 10),
            new CaptureCursor.Cell(2, 1, 0, 10),
            new CaptureCursor.Cell(2, 0, 1, 10),
            new CaptureCursor.Cell(2, 1, 1, 10)),
        cells);
    assertNull(
        cursor.peek(
            (x, z) -> {
              fail("completed cursor does not request columns");
              return null;
            }));
    assertThrows(IllegalStateException.class, cursor::advance);
  }

  @Test
  void finalCoordinateDoesNotOverflowAndVolumeLimitsApplyBeforeAnyWorldRead() {
    var cursor =
        new CaptureCursor(
            new CaptureBounds(
                Integer.MAX_VALUE, 0, Integer.MAX_VALUE, Integer.MAX_VALUE, 0, Integer.MAX_VALUE));
    assertNotNull(cursor.peek((x, z) -> new CaptureCursor.Column(0, 0)));
    cursor.advance();
    assertTrue(cursor.done());
    assertThrows(
        IllegalArgumentException.class,
        () -> new CaptureCursor(new CaptureBounds(0, 0, 0, 300, 1, 1)));
    assertThrows(
        IllegalArgumentException.class,
        () -> new CaptureCursor(new CaptureBounds(1, 0, 0, 0, 1, 1)));
  }
}
