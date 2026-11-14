package dev.minemories.client.util;

import org.slf4j.Logger;

/**
 * One log line for a problem that would otherwise repeat for every block, entity or capture: an
 * optional mod whose API is not the one this code knows.
 */
public final class WarnOnce {
  private final Logger logger;
  private final String message;
  private boolean warned;

  public WarnOnce(Logger logger, String message) {
    this.logger = logger;
    this.message = message;
  }

  public synchronized void warn(Throwable error) {
    if (warned) return;
    warned = true;
    logger.warn("{}: {}", message, error.toString());
  }

  /** Tests only: the next problem is logged again. */
  public synchronized void reset() {
    warned = false;
  }
}
