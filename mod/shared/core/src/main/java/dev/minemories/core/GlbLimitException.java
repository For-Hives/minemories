package dev.minemories.core;

import java.io.IOException;

/**
 * A capture over one of the API's GLB limits ({@link GlbLimits}): nothing is written, and the
 * player is asked to capture a smaller or less varied area.
 */
public final class GlbLimitException extends IOException {
  private static final long serialVersionUID = 1L;

  /**
   * Which limit: {@code json-bytes}, {@code images}, {@code textures}, {@code materials}, {@code
   * primitives}, …
   */
  private final String limit;

  private final long value;
  private final long maximum;

  public GlbLimitException(String limit, long value, long maximum) {
    super("GLB " + limit + " limit exceeded: " + value + " > " + maximum);
    this.limit = limit;
    this.value = value;
    this.maximum = maximum;
  }

  public String limit() {
    return limit;
  }

  public long value() {
    return value;
  }

  public long maximum() {
    return maximum;
  }
}
