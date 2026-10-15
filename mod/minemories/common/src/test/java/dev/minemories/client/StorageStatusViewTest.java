package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class StorageStatusViewTest {
  private static final StorageQuota FIRST = new StorageQuota(300, 1024, 724, 100, 20);
  private static final StorageQuota FULL = new StorageQuota(1024, 1024, 0, 0, 0);

  @Test
  void requestsOnlyWhilePairedAndAppliesResultsOnTheClientThread() {
    StorageStatusView view = new StorageStatusView();
    AtomicInteger calls = new AtomicInteger();
    List<Runnable> client = new ArrayList<>();
    CompletableFuture<StorageQuota> result = new CompletableFuture<>();
    view.update(
        0,
        false,
        () -> {
          calls.incrementAndGet();
          return result;
        },
        client::add);
    assertEquals(0, calls.get());
    view.reset(true);
    view.update(
        0,
        true,
        () -> {
          calls.incrementAndGet();
          return result;
        },
        client::add);
    view.update(
        20_000,
        true,
        () -> {
          calls.incrementAndGet();
          return result;
        },
        client::add);
    assertEquals(1, calls.get());
    result.complete(FIRST);
    assertNull(view.quota());
    assertEquals("Espace : chargement…", view.label());
    client.getFirst().run();
    assertEquals(FIRST, view.quota());
    assertEquals(FIRST.availableLabel(), view.label());
    view.update(
        11_999,
        true,
        () -> {
          calls.incrementAndGet();
          return result;
        },
        Runnable::run);
    assertEquals(1, calls.get());
    view.update(
        12_000,
        true,
        () -> {
          calls.incrementAndGet();
          return CompletableFuture.completedFuture(FULL);
        },
        Runnable::run);
    assertEquals(2, calls.get());
    assertEquals(FULL, view.quota());
  }

  @Test
  void closingOrChangingAccountRejectsLateSuccessAndFailure() {
    StorageStatusView view = new StorageStatusView();
    CompletableFuture<StorageQuota> old = new CompletableFuture<>();
    view.reset(true);
    view.update(0, true, () -> old, Runnable::run);
    view.reset(true);
    view.update(1, true, () -> CompletableFuture.completedFuture(FULL), Runnable::run);
    old.complete(FIRST);
    assertEquals(FULL, view.quota());
    CompletableFuture<StorageQuota> failed = new CompletableFuture<>();
    view.reset(true);
    view.update(2, true, () -> failed, Runnable::run);
    view.reset(true);
    view.update(3, true, () -> CompletableFuture.completedFuture(FIRST), Runnable::run);
    failed.completeExceptionally(new IllegalStateException("Old private error"));
    assertEquals(FIRST, view.quota());
    view.reset(true);
    CompletableFuture<StorageQuota> closing = new CompletableFuture<>();
    view.update(4, true, () -> closing, Runnable::run);
    view.update(
        5,
        false,
        () -> {
          throw new AssertionError("Must not contact an unpaired API");
        },
        Runnable::run);
    closing.complete(FULL);
    assertNull(view.quota());
    assertEquals("Galerie non connectée", view.label());
  }

  @Test
  void failedRefreshClearsOldNumbersAndRetriesAtTheInterval() {
    StorageStatusView view = new StorageStatusView();
    view.reset(true);
    view.update(0, true, () -> CompletableFuture.completedFuture(FIRST), Runnable::run);
    view.update(
        12_000,
        true,
        () -> CompletableFuture.failedFuture(new IllegalStateException("Private error")),
        Runnable::run);
    assertNull(view.quota());
    assertTrue(view.label().contains("indisponible"));
    assertFalse(view.label().contains("Private"));
    view.update(
        23_999,
        true,
        () -> {
          throw new AssertionError("Too early");
        },
        Runnable::run);
    view.update(
        24_000,
        true,
        () -> {
          throw new IllegalStateException("Invalid configuration");
        },
        Runnable::run);
    assertNull(view.quota());
    view.update(36_000, true, () -> CompletableFuture.completedFuture(FULL), Runnable::run);
    assertEquals(FULL, view.quota());
  }

  @Test
  void displaysControlledPairingAdviceWithoutArbitraryNetworkDetails() {
    StorageStatusView view = new StorageStatusView();
    view.reset(true);
    view.update(
        0,
        true,
        () ->
            CompletableFuture.failedFuture(
                new java.util.concurrent.CompletionException(
                    new StorageStatusClient.StatusException(
                        "Connexion expirée. Reconnecte ton compte."))),
        Runnable::run);
    assertEquals("Connexion expirée. Reconnecte ton compte.", view.label());
    assertNull(view.quota());
    view.update(
        12_000,
        true,
        () -> CompletableFuture.failedFuture(new java.io.IOException("private-device")),
        Runnable::run);
    assertFalse(view.label().contains("private-device"));
  }
}
