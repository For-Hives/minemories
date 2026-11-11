package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;

class CaptureListViewTest {
  private static CaptureHistory.Entry entry(String id, String world) {
    return new CaptureHistory.Entry(
        id, Path.of(id, "capture.glb"), Instant.EPOCH, 100, world, true);
  }

  private static List<CaptureHistory.Entry> many() {
    List<CaptureHistory.Entry> all = new ArrayList<>();
    for (int i = 0; i < 9; i++) all.add(entry("c" + i, "World"));
    return all;
  }

  @Test
  void pagesThroughGroupedCapturesAndTracksUnsentOnes() {
    var view = new CaptureListView();
    assertTrue(view.pending());
    view.refresh(() -> CompletableFuture.completedFuture(many()), Runnable::run);
    assertFalse(view.pending());
    assertFalse(view.failed());
    assertEquals(9, view.entries().size());
    assertEquals(9, view.unsent().size());
    assertEquals(2, view.pageCount());
    assertEquals(CaptureListView.LINES, view.lines().size());
    assertFalse(view.hasPrevious());
    view.previous();
    assertEquals(0, view.page());
    view.next();
    assertEquals(1, view.page());
    assertFalse(view.hasNext());
    view.next();
    assertEquals(1, view.page());
    view.markUploaded("c8");
    assertEquals(8, view.unsent().size());
    assertEquals(1, view.page(), "stays on the page after a status change");
    view.previous();
    assertEquals(0, view.page());
  }

  @Test
  void failuresAndEmptyListsAreReportedAndTheLastPageIsClamped() {
    var view = new CaptureListView();
    view.refresh(() -> CompletableFuture.completedFuture(many()), Runnable::run);
    view.next();
    view.refresh(
        () -> CompletableFuture.completedFuture(List.of(entry("only", "World"))), Runnable::run);
    assertEquals(0, view.page());
    assertEquals(1, view.pageCount());
    view.refresh(() -> CompletableFuture.failedFuture(new java.io.IOException("x")), Runnable::run);
    assertTrue(view.failed());
    assertTrue(view.empty());
    assertEquals(1, view.pageCount());
    assertTrue(view.lines().isEmpty());
    view.refresh(
        () -> {
          throw new IllegalStateException("no folder");
        },
        Runnable::run);
    assertTrue(view.failed());
    view.refresh(() -> CompletableFuture.completedFuture(null), Runnable::run);
    assertTrue(view.failed());
  }

  @Test
  void staleAndClosedResultsAreIgnored() {
    var view = new CaptureListView();
    var slow = new CompletableFuture<List<CaptureHistory.Entry>>();
    view.refresh(() -> slow, Runnable::run);
    view.refresh(
        () -> CompletableFuture.completedFuture(List.of(entry("new", "World"))), Runnable::run);
    slow.complete(many());
    assertEquals(1, view.entries().size());
    var late = new CompletableFuture<List<CaptureHistory.Entry>>();
    view.refresh(() -> late, Runnable::run);
    view.close();
    late.complete(many());
    assertEquals(1, view.entries().size());
    assertFalse(view.pending());
  }
}
