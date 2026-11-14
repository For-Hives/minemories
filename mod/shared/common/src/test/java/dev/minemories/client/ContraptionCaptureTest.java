package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import com.simibubi.create.content.contraptions.AbstractContraptionEntity;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class ContraptionCaptureTest {
  /** Same simple name, wrong package: not Create's. */
  static final class AbstractContraptionEntity2 {}

  @AfterEach
  void forget() {
    ContraptionCapture.reset();
  }

  @Test
  void recognisesCreateContraptionsByTheirClassHierarchyOnly() {
    assertTrue(ContraptionCapture.isContraption(new AbstractContraptionEntity.Windmill()));
    assertFalse(ContraptionCapture.isContraption(new Object()));
    assertFalse(ContraptionCapture.isContraption(new AbstractContraptionEntity2()));
    assertFalse(ContraptionCapture.isContraption("a string"));
  }

  @Test
  void readsTheContraptionBlocksThroughItsNonPublicAccessor() {
    var windmill = new AbstractContraptionEntity.Windmill();
    windmill.contraption.blocks.put("0,0,0", "sail");
    windmill.contraption.blocks.put("0,1,0", "sail2");
    assertEquals(List.of("sail", "sail2"), List.copyOf(ContraptionCapture.blocks(windmill)));
    assertNull(ContraptionCapture.blocks(new AbstractContraptionEntity.Broken()));
    assertNull(ContraptionCapture.blocks(new Object()));
  }

  @Test
  void appliesTheContraptionOwnTransformAndSurvivesOneThatFails() {
    var windmill = new AbstractContraptionEntity.Windmill();
    Object pose = new Object();
    assertTrue(ContraptionCapture.applyLocalTransforms(windmill, pose, 1f));
    assertSame(pose, windmill.lastPose);
    assertEquals(1f, windmill.lastTick);
    // Found once per class, then reused.
    assertTrue(ContraptionCapture.applyLocalTransforms(windmill, pose, 0.5f));
    assertEquals(0.5f, windmill.lastTick);
    assertFalse(
        ContraptionCapture.applyLocalTransforms(new AbstractContraptionEntity.Broken(), pose, 1f));
    assertFalse(ContraptionCapture.applyLocalTransforms(new Object(), pose, 1f));
  }

  @Test
  void drawsBlocksOnlyForACreateWithASeparateBlockPass() {
    // The test classpath has a stand-in Create 0.5 layer pass.
    assertTrue(ContraptionCapture.needsBlocks(new AbstractContraptionEntity.Windmill()));
    assertTrue(ContraptionCapture.needsBlocks(new AbstractContraptionEntity.Windmill()));
    assertFalse(ContraptionCapture.needsBlocks(new Object()));
    // Create 6 has no such pass: its renderer already draws the blocks.
    assertFalse(
        ContraptionCapture.exists("com.simibubi.create.Missing", getClass().getClassLoader()));
    assertTrue(
        ContraptionCapture.exists(ContraptionCapture.LAYER_PASS, getClass().getClassLoader()));
  }
}
