package dev.minemories.client.mods.create;

import static org.junit.jupiter.api.Assertions.*;

import com.mojang.blaze3d.vertex.PoseStack;
import com.simibubi.create.content.contraptions.AbstractContraptionEntity;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class CreateContraptionsTest {
  @AfterEach
  void forget() {
    ContraptionBlocks.reset();
    ContraptionStructure.reset();
  }

  @Test
  void anEntityThatIsNotACreateContraptionHasNoBodyToDraw() {
    var body = CreateContraptions.prepare(new Object(), "level", 0, 0, 0);
    assertFalse(body.present());
    body.draw(List.of("solid"), layer -> fail("nothing to draw"), new PoseStack(), null, null);
  }

  @Test
  void aCreateWhoseRenderingApiIsUnknownIsDrawnBlockByBlock() {
    // The test classpath has Create 0.5's layer pass but not the Flywheel 0.6 the structure
    // buffers need: only the block-by-block way can draw this windmill.
    var windmill = new AbstractContraptionEntity.Windmill();
    windmill.contraption.blocks.put("0,0,0", "sail");
    var body = CreateContraptions.prepare(windmill, "level", 1, 2, 3);
    assertTrue(body.present());

    PoseStack pose = new PoseStack();
    body.draw(List.of("solid"), layer -> fail("no structure buffer"), pose, null, null);
    assertSame(pose, windmill.lastPose, "the blocks take the contraption's own transform");
    assertEquals(1f, windmill.lastTick, "the latest tick, like every entity");
  }
}
