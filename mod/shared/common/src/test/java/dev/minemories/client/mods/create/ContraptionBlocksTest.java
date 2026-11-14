package dev.minemories.client.mods.create;

import static org.junit.jupiter.api.Assertions.*;

import com.simibubi.create.content.contraptions.AbstractContraptionEntity;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class ContraptionBlocksTest {
  /** Same simple name, wrong package: not Create's. */
  static final class AbstractContraptionEntity2 {}

  @AfterEach
  void forget() {
    ContraptionBlocks.reset();
  }

  @Test
  void recognisesCreateContraptionsByTheirClassHierarchyOnly() {
    assertTrue(ContraptionBlocks.isContraption(new AbstractContraptionEntity.Windmill()));
    assertFalse(ContraptionBlocks.isContraption(new Object()));
    assertFalse(ContraptionBlocks.isContraption(new AbstractContraptionEntity2()));
    assertFalse(ContraptionBlocks.isContraption("a string"));
  }

  @Test
  void readsTheContraptionBlocksThroughItsNonPublicAccessor() {
    var windmill = new AbstractContraptionEntity.Windmill();
    windmill.contraption.blocks.put("0,0,0", "sail");
    windmill.contraption.blocks.put("0,1,0", "sail2");
    assertEquals(List.of("sail", "sail2"), List.copyOf(ContraptionBlocks.blocks(windmill)));
    assertNull(ContraptionBlocks.blocks(new AbstractContraptionEntity.Broken()));
    assertNull(ContraptionBlocks.blocks(new Object()));
  }

  @Test
  void appliesTheContraptionOwnTransformAndSurvivesOneThatFails() {
    var windmill = new AbstractContraptionEntity.Windmill();
    Object pose = new Object();
    assertTrue(ContraptionBlocks.applyLocalTransforms(windmill, pose, 1f));
    assertSame(pose, windmill.lastPose);
    assertEquals(1f, windmill.lastTick);
    // Found once per class, then reused.
    assertTrue(ContraptionBlocks.applyLocalTransforms(windmill, pose, 0.5f));
    assertEquals(0.5f, windmill.lastTick);
    assertFalse(
        ContraptionBlocks.applyLocalTransforms(new AbstractContraptionEntity.Broken(), pose, 1f));
    assertFalse(ContraptionBlocks.applyLocalTransforms(new Object(), pose, 1f));
  }

  @Test
  void drawsBlocksOnlyForACreateWithASeparateBlockPass() {
    // The test classpath has a stand-in Create 0.5 layer pass.
    assertTrue(ContraptionBlocks.needsBlocks(new AbstractContraptionEntity.Windmill()));
    assertTrue(ContraptionBlocks.needsBlocks(new AbstractContraptionEntity.Windmill()));
    assertFalse(ContraptionBlocks.needsBlocks(new Object()));
    // Create 6 has no such pass: its renderer already draws the blocks.
    assertFalse(
        ContraptionBlocks.exists("com.simibubi.create.Missing", getClass().getClassLoader()));
    assertTrue(ContraptionBlocks.exists(ContraptionBlocks.LAYER_PASS, getClass().getClassLoader()));
  }
}
