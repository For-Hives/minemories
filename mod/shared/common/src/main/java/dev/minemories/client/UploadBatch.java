package dev.minemories.client;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

/**
 * Sequential "send these captures" run. It is a plain state machine: the screen asks {@link
 * #next()} for the capture to upload, reports the outcome, and repeats until {@link #running()}
 * turns false. Starting while a run is active is ignored, so a double click cannot upload twice.
 */
final class UploadBatch {
  enum State {
    IDLE,
    RUNNING,
    DONE,
    STOPPED
  }

  private final Deque<CaptureHistory.Entry> queue = new ArrayDeque<>();
  private State state = State.IDLE;
  private CaptureHistory.Entry inFlight;
  private int total;
  private int sent;
  private int failed;
  private UploadFailure stoppedBy;
  private String lastError = "";

  /** Starts a run over the captures that are not uploaded yet; false if busy or nothing to do. */
  boolean start(List<CaptureHistory.Entry> captures) {
    if (state == State.RUNNING) return false;
    queue.clear();
    for (CaptureHistory.Entry capture : captures) {
      if (capture.readable() && !capture.uploaded()) queue.add(capture);
    }
    inFlight = null;
    sent = 0;
    failed = 0;
    stoppedBy = null;
    lastError = "";
    total = queue.size();
    state = total == 0 ? State.IDLE : State.RUNNING;
    return total > 0;
  }

  /** The next capture to upload, or null while one is in flight or the run is over. */
  CaptureHistory.Entry next() {
    if (state != State.RUNNING || inFlight != null) return null;
    inFlight = queue.poll();
    if (inFlight == null) state = State.DONE;
    return inFlight;
  }

  /** Records the outcome of the capture returned by {@link #next()}. */
  void succeeded() {
    if (inFlight == null) return;
    inFlight = null;
    sent++;
  }

  void failed(UploadFailure failure) {
    if (inFlight == null) return;
    inFlight = null;
    lastError = failure.message();
    if (!failure.kind().stopsBatch()) {
      failed++;
    } else if (state == State.RUNNING) {
      stoppedBy = failure;
      state = State.STOPPED;
      queue.clear();
    }
  }

  /** Stops after the capture in flight; the remaining ones are left alone. */
  void cancel() {
    if (state != State.RUNNING) return;
    state = State.STOPPED;
    queue.clear();
  }

  State state() {
    return state;
  }

  boolean running() {
    return state == State.RUNNING;
  }

  boolean inFlight() {
    return inFlight != null;
  }

  int total() {
    return total;
  }

  int sent() {
    return sent;
  }

  int failed() {
    return failed;
  }

  /** One-based index of the capture being sent. */
  int position() {
    return Math.min(total, sent + failed + 1);
  }

  /** Captures never attempted because the run stopped early. */
  int skipped() {
    return state == State.STOPPED ? total - sent - failed - (inFlight != null ? 1 : 0) : 0;
  }

  UploadFailure stoppedBy() {
    return stoppedBy;
  }

  String lastError() {
    return lastError;
  }
}
