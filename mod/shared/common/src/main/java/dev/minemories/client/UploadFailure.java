package dev.minemories.client;

/** Why an upload failed, in the terms a batch needs to decide whether to go on. */
record UploadFailure(Kind kind, long retryAfterSeconds, String message) {
  static final long DEFAULT_RETRY_SECONDS = 60;
  static final long MAX_RETRY_SECONDS = 3600;

  enum Kind {
    /** HTTP 429: the API asked us to wait. */
    RATE_LIMITED,
    /** HTTP 401/403: the device token is no longer accepted. */
    UNAUTHORIZED,
    /** The private gallery is full. */
    QUOTA,
    /** Anything else; the next capture may still work. */
    OTHER;

    /** True when every following upload would fail the same way. */
    boolean stopsBatch() {
      return this != OTHER;
    }
  }

  /** Reads a {@code Retry-After} value in seconds; dates and garbage fall back to a default. */
  static long parseRetryAfter(String header) {
    if (header == null) return DEFAULT_RETRY_SECONDS;
    try {
      long seconds = Long.parseLong(header.strip());
      return Math.max(1, Math.min(MAX_RETRY_SECONDS, seconds));
    } catch (NumberFormatException error) {
      return DEFAULT_RETRY_SECONDS;
    }
  }
}
