package dev.minemories.client.mods.create;

import com.mojang.blaze3d.vertex.PoseStack;
import java.util.function.Function;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.block.BlockRenderDispatcher;

/**
 * Optional integration: the assembled blocks of Create 0.5 contraptions (windmill sails, machines
 * on a bearing, pistons, pulleys, gantries, minecart contraptions, train carriages).
 *
 * <p>Create 0.5 draws those blocks in a level render pass of its own, not from the contraption's
 * entity renderer, so an entity capture alone keeps the pivot and the actors and loses the body.
 * Create 6 has no such pass: its entity renderer draws the blocks once instancing is off during the
 * capture, and nothing here runs ({@link ContraptionBlocks#needsBlocks}).
 *
 * <p>The body is drawn one of two ways, the precise one first:
 *
 * <ol>
 *   <li>{@link ContraptionStructure}: Create's own structure buffers, with the faces between
 *       neighbours hidden as in game. It also puts Create's matrices at the capture pose while the
 *       entity renderer runs, so the contraption's block entities and actors land in the capture
 *       and not where the camera last saw them.
 *   <li>{@link ContraptionBlocks}: block by block with the game's block renderer, for a Create 0.5
 *       whose rendering API is not the one {@code ContraptionStructure} knows.
 * </ol>
 *
 * <p>No Create class is linked; a contraption that neither way can read keeps what its entity
 * renderer drew, and the rest of the capture is untouched.
 */
public final class CreateContraptions {
  /** One contraption entity being collected. */
  public interface Body {
    /** False for every entity whose renderer already draws all of it: nothing to add. */
    boolean present();

    /**
     * Draws the contraption's blocks, after its entity renderer ran.
     *
     * @param layers the chunk render layers ({@code RenderType.chunkBufferLayers()})
     * @param layerBuffers the capture's vertex consumer for one of those layers
     * @param pose the capture pose at the entity's position, for the block-by-block way
     * @param buffers the capture's buffers, for the block-by-block way
     */
    void draw(
        Iterable<?> layers,
        Function<Object, Object> layerBuffers,
        PoseStack pose,
        MultiBufferSource buffers,
        BlockRenderDispatcher blocks);
  }

  private static final Body NONE =
      new Body() {
        @Override
        public boolean present() {
          return false;
        }

        @Override
        public void draw(
            Iterable<?> layers,
            Function<Object, Object> layerBuffers,
            PoseStack pose,
            MultiBufferSource buffers,
            BlockRenderDispatcher blocks) {}
      };

  private CreateContraptions() {}

  /**
   * Call before the entity renderer, inside the capture's render scope, with the translation of its
   * pose (the capture pose only translates).
   */
  public static Body prepare(Object entity, Object level, double x, double y, double z) {
    if (!ContraptionBlocks.needsBlocks(entity)) return NONE;
    ContraptionStructure.Drawing structure = ContraptionStructure.prepare(entity, level, x, y, z);
    return new Body() {
      @Override
      public boolean present() {
        return true;
      }

      @Override
      public void draw(
          Iterable<?> layers,
          Function<Object, Object> layerBuffers,
          PoseStack pose,
          MultiBufferSource buffers,
          BlockRenderDispatcher blocks) {
        if (!structure.finish(layers, layerBuffers))
          ContraptionBlocks.render(entity, pose, buffers, blocks);
      }
    };
  }
}
