package dev.minemories.core;

import java.util.Collection;

/**
 * How much a place seems to matter to the player, from purely local, non-personal signals. The
 * weights are constants so the result is explainable and testable without Minecraft. A signal that
 * is not known ({@link ChunkSignals#UNKNOWN}) is left out and the remaining weights are
 * renormalized, never counted as zero.
 */
public final class ZoneScore {
  static final double ACTIVE_WEIGHT = 0.30, MODIFICATIONS_WEIGHT = 0.25, NON_NATURAL_WEIGHT = 0.20;
  static final double BLOCK_ENTITIES_WEIGHT = 0.15, LIGHTS_WEIGHT = 0.05, INHABITED_WEIGHT = 0.10;

  /** Saturation points: a signal at its cap contributes fully, the scale is logarithmic below. */
  static final double ACTIVE_CAP_SECONDS = 2 * 3600, MODIFICATIONS_CAP = 64, NON_NATURAL_CAP = 0.30;

  static final double BLOCK_ENTITIES_CAP = 8, LIGHTS_CAP = 16, INHABITED_CAP_TICKS = 72_000;

  private ZoneScore() {}

  /** Signals of one 16 × 16 chunk column; negative means "not known". */
  public record ChunkSignals(
      long activeSeconds,
      int modifications,
      double nonNaturalShare,
      int blockEntities,
      int lights,
      long inhabitedTicks) {
    public static final int UNKNOWN = -1;

    public static ChunkSignals activeOnly(long seconds) {
      return new ChunkSignals(seconds, UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN, UNKNOWN);
    }
  }

  private static double saturate(double value, double cap) {
    return Math.min(1, Math.log1p(Math.max(0, value)) / Math.log1p(cap));
  }

  private record Term(double value, double cap, double weight, boolean ratio) {
    double contribution() {
      return weight * (ratio ? Math.min(1, value / cap) : saturate(value, cap));
    }
  }

  /** Score in [0, 1] of one chunk; 0 when nothing is known. */
  public static double chunk(ChunkSignals signals) {
    Term[] terms = {
      new Term(signals.activeSeconds(), ACTIVE_CAP_SECONDS, ACTIVE_WEIGHT, false),
      new Term(signals.modifications(), MODIFICATIONS_CAP, MODIFICATIONS_WEIGHT, false),
      // A ratio saturates linearly at its cap; counts saturate logarithmically.
      new Term(signals.nonNaturalShare(), NON_NATURAL_CAP, NON_NATURAL_WEIGHT, true),
      new Term(signals.blockEntities(), BLOCK_ENTITIES_CAP, BLOCK_ENTITIES_WEIGHT, false),
      new Term(signals.lights(), LIGHTS_CAP, LIGHTS_WEIGHT, false),
      new Term(signals.inhabitedTicks(), INHABITED_CAP_TICKS, INHABITED_WEIGHT, false)
    };
    double sum = 0, weights = 0;
    for (Term term : terms) {
      if (term.value() < 0) continue;
      weights += term.weight();
      sum += term.contribution();
    }
    return weights == 0 ? 0 : sum / weights;
  }

  /**
   * A zone of 4 × 4 chunks: the best chunk matters most, the average keeps a lone outlier honest.
   */
  public static double zone(Collection<Double> chunkScores) {
    if (chunkScores.isEmpty()) return 0;
    double best = 0, total = 0;
    for (double score : chunkScores) {
      best = Math.max(best, score);
      total += score;
    }
    return 0.6 * best + 0.4 * total / chunkScores.size();
  }

  /**
   * Advisory capture radius in blocks (multiple of 16, between 16 and 64); never applied
   * automatically.
   */
  public static int advisoryRadius(double zoneScore) {
    double clamped = Math.max(0, Math.min(1, zoneScore));
    return 16 + 16 * (int) Math.round(clamped * 3);
  }
}
