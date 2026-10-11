package dev.minemories.neoforge;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.Executor;
import java.util.function.Supplier;

final class StorageStatusView {
  private static final long REFRESH_MILLIS = 12_000;
  private StorageQuota quota;
  private String message = "Galerie non connectée";
  private long generation;
  private long nextRefresh;
  private boolean pending;

  StorageQuota quota() {
    return quota;
  }

  String label() {
    return quota == null ? message : quota.availableLabel();
  }

  void reset(boolean paired) {
    generation++;
    pending = false;
    nextRefresh = 0;
    quota = null;
    message = paired ? "Espace : chargement…" : "Galerie non connectée";
  }

  void update(
      long now,
      boolean paired,
      Supplier<CompletableFuture<StorageQuota>> fetch,
      Executor clientThread) {
    if (!paired) {
      reset(false);
      return;
    }
    if (pending || now < nextRefresh) return;
    long request = ++generation;
    nextRefresh = now + REFRESH_MILLIS;
    pending = true;
    try {
      fetch.get().whenCompleteAsync((value, error) -> finish(request, value, error), clientThread);
    } catch (RuntimeException error) {
      finish(request, null, error);
    }
  }

  private void finish(long request, StorageQuota value, Throwable error) {
    if (request != generation) return;
    pending = false;
    quota = error == null ? value : null;
    Throwable cause = error;
    while (cause instanceof CompletionException && cause.getCause() != null) {
      cause = cause.getCause();
    }
    message =
        cause instanceof StorageStatusClient.StatusException
            ? cause.getMessage()
            : "Espace indisponible · voir les détails";
  }
}
