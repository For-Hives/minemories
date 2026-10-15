package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;

class CaptureHistoryViewTest {
  private static CaptureHistory.Entry entry(String id) {
    return new CaptureHistory.Entry(
        id, Path.of(id, "capture.glb"), Instant.EPOCH, 100, "World", true);
  }

  @Test
  void selectingPagingAndReturningRetainTheExpectedCursor() {
    var view = new CaptureHistoryView();
    var latest = new CaptureHistory.Page(List.of(entry("latest"), entry("older")), true);
    List<String> cursors = new ArrayList<>();
    view.refresh(
        cursor -> {
          cursors.add(cursor);
          return CompletableFuture.completedFuture(latest);
        },
        Runnable::run);
    assertFalse(view.pending());
    assertFalse(view.hasPrevious());
    view.select(1);
    assertEquals("older", view.selected().id());
    view.next(
        cursor -> {
          cursors.add(cursor);
          return CompletableFuture.completedFuture(
              new CaptureHistory.Page(List.of(entry("oldest")), false));
        },
        Runnable::run);
    assertNull(view.selected());
    assertTrue(view.hasPrevious());
    view.next(ignored -> fail("No next page"), Runnable::run);
    view.previous(
        cursor -> {
          cursors.add(cursor);
          return CompletableFuture.completedFuture(latest);
        },
        Runnable::run);
    assertEquals(3, cursors.size());
    assertNull(cursors.get(0));
    assertEquals("older", cursors.get(1));
    assertNull(cursors.get(2));
    assertFalse(view.hasPrevious());
    view.previous(ignored -> fail("No previous page"), Runnable::run);
    view.select(9);
    assertNull(view.selected());
  }

  @Test
  void closingOrRefreshingDiscardsLateResponses() {
    var view = new CaptureHistoryView();
    var stale = new CompletableFuture<CaptureHistory.Page>();
    var latest = new CaptureHistory.Page(List.of(entry("latest")), false);
    view.refresh(ignored -> stale, Runnable::run);
    assertTrue(view.pending());
    view.next(ignored -> fail("Loading"), Runnable::run);
    view.refresh(ignored -> CompletableFuture.completedFuture(latest), Runnable::run);
    stale.complete(new CaptureHistory.Page(List.of(entry("stale")), false));
    assertEquals(latest, view.page());
    var closed = new CompletableFuture<CaptureHistory.Page>();
    view.refresh(ignored -> closed, Runnable::run);
    view.close();
    closed.complete(latest);
    assertTrue(view.page().entries().isEmpty());
    assertFalse(view.pending());
  }

  @Test
  void completionRunsOnTheClientExecutorAndErrorsAllowRetry() {
    var view = new CaptureHistoryView();
    List<Runnable> client = new ArrayList<>();
    view.refresh(
        ignored -> CompletableFuture.failedFuture(new IllegalStateException("disk")), client::add);
    assertTrue(view.pending());
    assertEquals(1, client.size());
    client.removeFirst().run();
    assertFalse(view.pending());
    assertTrue(view.message().contains("indisponible"));
    view.refresh(
        ignored -> {
          throw new IllegalStateException("settings");
        },
        Runnable::run);
    assertFalse(view.pending());
    view.refresh(ignored -> CompletableFuture.completedFuture(null), Runnable::run);
    assertTrue(view.message().contains("indisponible"));
    view.refresh(
        ignored -> CompletableFuture.completedFuture(new CaptureHistory.Page(List.of(), false)),
        Runnable::run);
    assertTrue(view.message().contains("Aucune capture"));
  }
}
