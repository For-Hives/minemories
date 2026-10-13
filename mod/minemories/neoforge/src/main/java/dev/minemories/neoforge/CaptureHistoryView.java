package dev.minemories.neoforge;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.function.Function;

final class CaptureHistoryView {
  private final List<String> previous = new ArrayList<>();
  private CaptureHistory.Page page = new CaptureHistory.Page(List.of(), false);
  private CaptureHistory.Entry selected;
  private String cursor;
  private String message = "Chargement des captures locales…";
  private long generation;
  private boolean pending;

  CaptureHistory.Page page() {
    return page;
  }

  CaptureHistory.Entry selected() {
    return selected;
  }

  String message() {
    return message;
  }

  boolean pending() {
    return pending;
  }

  boolean hasPrevious() {
    return !previous.isEmpty();
  }

  void select(int index) {
    selected = index >= 0 && index < page.entries().size() ? page.entries().get(index) : null;
  }

  void next(Function<String, CompletableFuture<CaptureHistory.Page>> fetch, Executor clientThread) {
    if (pending || !page.hasMore() || page.entries().isEmpty()) return;
    previous.add(cursor);
    cursor = page.entries().getLast().id();
    refresh(fetch, clientThread);
  }

  void previous(
      Function<String, CompletableFuture<CaptureHistory.Page>> fetch, Executor clientThread) {
    if (pending || previous.isEmpty()) return;
    cursor = previous.removeLast();
    refresh(fetch, clientThread);
  }

  void refresh(
      Function<String, CompletableFuture<CaptureHistory.Page>> fetch, Executor clientThread) {
    long request = ++generation;
    selected = null;
    page = new CaptureHistory.Page(List.of(), false);
    pending = true;
    message = "Chargement des captures locales…";
    try {
      fetch
          .apply(cursor)
          .whenCompleteAsync((value, error) -> finish(request, value, error), clientThread);
    } catch (RuntimeException error) {
      finish(request, null, error);
    }
  }

  private void finish(long request, CaptureHistory.Page value, Throwable error) {
    if (request != generation) return;
    pending = false;
    page = error == null && value != null ? value : new CaptureHistory.Page(List.of(), false);
    message =
        error != null || value == null
            ? "Historique indisponible. Vérifie le dossier local dans le mode avancé."
            : page.entries().isEmpty()
                ? "Aucune capture sur cette page. Actualise ou reviens à la page précédente."
                : "Choisis une capture locale pour l’envoyer dans ta galerie privée.";
  }

  void close() {
    generation++;
    pending = false;
  }
}
