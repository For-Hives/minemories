package com.simibubi.create.content.contraptions;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Stands in for Create's contraption entity in tests: the shapes the capture reads by reflection (a
 * contraption with its blocks, and a local transform on a subclass).
 */
public abstract class AbstractContraptionEntity {
  public final Contraption contraption = new Contraption();

  protected Contraption getContraption() {
    return contraption;
  }

  public abstract void applyLocalTransforms(Object pose, float partialTick);

  public static class Contraption {
    public final Map<String, Object> blocks = new LinkedHashMap<>();

    public Map<String, Object> getBlocks() {
      return blocks;
    }
  }

  /** A windmill: turns the pose it is given. */
  public static class Windmill extends AbstractContraptionEntity {
    public Object lastPose;
    public float lastTick = -1;

    @Override
    public void applyLocalTransforms(Object pose, float partialTick) {
      lastPose = pose;
      lastTick = partialTick;
    }
  }

  /** A contraption whose transform fails, as an unexpected Create version might. */
  public static class Broken extends AbstractContraptionEntity {
    @Override
    public void applyLocalTransforms(Object pose, float partialTick) {
      throw new IllegalStateException("not ready");
    }

    @Override
    protected Contraption getContraption() {
      return null;
    }
  }
}
