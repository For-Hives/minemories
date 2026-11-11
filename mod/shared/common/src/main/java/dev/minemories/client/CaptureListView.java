package dev.minemories.client;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.function.Supplier;

/** What the local captures screen shows: every capture grouped by world, one page at a time. */
final class CaptureListView {
  static final int LINES = 6;
  private List<CaptureHistory.Entry> entries = List.of();
  private List<List<CaptureGroups.Line>> pages = List.of();
  private int page;
  private long generation;
  private boolean pending = true;
  private boolean failed;

  boolean pending() {
    return pending;
  }

  boolean failed() {
    return failed;
  }

  boolean empty() {
    return entries.isEmpty();
  }

  List<CaptureHistory.Entry> entries() {
    return entries;
  }

  /** Captures that can still be sent. */
  List<CaptureHistory.Entry> unsent() {
    return entries.stream().filter(entry -> entry.readable() && !entry.uploaded()).toList();
  }

  List<CaptureGroups.Line> lines() {
    return page < pages.size() ? pages.get(page) : List.of();
  }

  int page() {
    return page;
  }

  int pageCount() {
    return Math.max(1, pages.size());
  }

  boolean hasPrevious() {
    return page > 0;
  }

  boolean hasNext() {
    return page + 1 < pages.size();
  }

  void previous() {
    if (hasPrevious()) page--;
  }

  void next() {
    if (hasNext()) page++;
  }

  /** Reloads the list, staying on the same page when it still exists. */
  void refresh(
      Supplier<CompletableFuture<List<CaptureHistory.Entry>>> fetch, Executor clientThread) {
    long request = ++generation;
    pending = true;
    try {
      fetch.get().whenCompleteAsync((value, error) -> finish(request, value, error), clientThread);
    } catch (RuntimeException error) {
      finish(request, null, error);
    }
  }

  private void finish(long request, List<CaptureHistory.Entry> value, Throwable error) {
    if (request != generation) return;
    pending = false;
    failed = error != null || value == null;
    entries = failed ? List.of() : List.copyOf(value);
    layout();
  }

  /** Flags one capture as sent without touching the disk again. */
  void markUploaded(String id) {
    List<CaptureHistory.Entry> updated = new ArrayList<>();
    for (CaptureHistory.Entry entry : entries) {
      updated.add(entry.id().equals(id) ? entry.withUploaded(true) : entry);
    }
    entries = updated;
    layout();
  }

  private void layout() {
    pages = CaptureGroups.pages(CaptureGroups.group(entries), LINES);
    page = Math.min(page, Math.max(0, pages.size() - 1));
  }

  void close() {
    generation++;
    pending = false;
  }
}
