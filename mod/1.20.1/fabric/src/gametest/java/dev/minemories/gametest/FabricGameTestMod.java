package dev.minemories.gametest;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.renderer.v1.model.ForwardingBakedModel;
import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.model.BakedModel;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

/**
 * Fabric test mod: drives the capture scenario and the screen check from the client tick (dev run
 * only).
 */
public final class FabricGameTestMod implements ClientModInitializer {
  private static final Logger LOGGER = LogManager.getLogger("minemories-gametest");
  private boolean wrappedModelChecked;

  @Override
  public void onInitializeClient() {
    if (!Boolean.getBoolean("minemories.gametest")) return;
    ClientTickEvents.END_CLIENT_TICK.register(
        client -> {
          if (!wrappedModelChecked && client.level != null) {
            wrappedModelChecked = true;
            checkWrappedVanillaModel(client);
          }
          TickDrivenCapture.tick();
        });
  }

  /**
   * A non-vanilla model that wraps a vanilla one (Create's blocks through porting_lib, for one)
   * made Fabric API 0.92's Indigo cast the capture's RenderContext to its own class and fail the
   * whole export. The block must still come out, as its plain quads.
   */
  private static void checkWrappedVanillaModel(Minecraft mc) {
    try {
      BlockState stone = Blocks.STONE.defaultBlockState();
      BakedModel vanilla = mc.getModelManager().getBlockModelShaper().getBlockModel(stone);
      BakedModel wrapped =
          new ForwardingBakedModel() {
            {
              wrapped = vanilla;
            }

            @Override
            public boolean isVanillaAdapter() {
              return false;
            }
          };
      expectQuads(mc, wrapped, stone, "Wrapped stone model");
      // A copycat (Copycats+, Create's copycat step and panel) has no plain quads: it draws the
      // copied block by asking that block's vanilla model to emit into the same render context.
      BakedModel copycat =
          new ForwardingBakedModel() {
            {
              wrapped = vanilla;
            }

            @Override
            public boolean isVanillaAdapter() {
              return false;
            }

            @Override
            public java.util.List<net.minecraft.client.renderer.block.model.BakedQuad> getQuads(
                BlockState state, Direction face, net.minecraft.util.RandomSource random) {
              return java.util.List.of();
            }

            @Override
            public void emitBlockQuads(
                net.minecraft.world.level.BlockAndTintGetter view,
                BlockState state,
                BlockPos pos,
                java.util.function.Supplier<net.minecraft.util.RandomSource> random,
                net.fabricmc.fabric.api.renderer.v1.render.RenderContext context) {
              context.pushTransform(quad -> true);
              ((net.fabricmc.fabric.api.renderer.v1.model.FabricBakedModel) vanilla)
                  .emitBlockQuads(view, stone, pos, random, context);
              context.popTransform();
            }
          };
      expectQuads(mc, copycat, stone, "Copycat-style stone model");
      // Copycats+ cuts the copied block in a mesh of its own, then outputs that mesh to the
      // context's emitter; the renderer's Mesh.outputTo casts that emitter to its own class.
      BakedModel meshCopycat =
          new ForwardingBakedModel() {
            {
              wrapped = vanilla;
            }

            @Override
            public boolean isVanillaAdapter() {
              return false;
            }

            @Override
            public java.util.List<net.minecraft.client.renderer.block.model.BakedQuad> getQuads(
                BlockState state, Direction face, net.minecraft.util.RandomSource random) {
              return java.util.List.of();
            }

            @Override
            public void emitBlockQuads(
                net.minecraft.world.level.BlockAndTintGetter view,
                BlockState state,
                BlockPos pos,
                java.util.function.Supplier<net.minecraft.util.RandomSource> random,
                net.fabricmc.fabric.api.renderer.v1.render.RenderContext context) {
              var renderer = net.fabricmc.fabric.api.renderer.v1.RendererAccess.INSTANCE.getRenderer();
              var builder = renderer.meshBuilder();
              var emitter = builder.getEmitter();
              var material =
                  renderer.materialById(
                      net.fabricmc.fabric.api.renderer.v1.material.RenderMaterial.MATERIAL_STANDARD);
              for (Direction face : Direction.values())
                for (var quad : vanilla.getQuads(stone, face, random.get()))
                  emitter.fromVanilla(quad, material, face).emit();
              builder.build().outputTo(context.getEmitter());
            }
          };
      expectQuads(mc, meshCopycat, stone, "Mesh-output copycat stone model");
    } catch (Throwable failure) {
      LOGGER.error("MINEMORIES-GAMETEST FAILED", failure);
      Runtime.getRuntime().halt(1);
    }
  }

  private static void expectQuads(Minecraft mc, BakedModel model, BlockState stone, String name)
      throws ReflectiveOperationException {
      Class<?> platform = Class.forName("dev.minemories.fabric.FabricPlatform");
      Class<?> request = Class.forName("dev.minemories.client.ClientPlatform$ModelRequest");
      Class<?> sink = Class.forName("dev.minemories.client.ClientPlatform$QuadSink");
      List<Object> quads = new ArrayList<>();
      Object collect =
          java.lang.reflect.Proxy.newProxyInstance(
              sink.getClassLoader(), new Class<?>[] {sink}, (proxy, method, args) -> {
                quads.add(args[0]);
                return null;
              });
      Method emit =
          platform.getDeclaredMethod(
              "emitModel",
              Minecraft.class,
              BakedModel.class,
              BlockState.class,
              request,
              Predicate.class,
              sink);
      emit.setAccessible(true);
      Predicate<Direction> everyFace = face -> true;
      emit.invoke(
          null,
          mc,
          model,
          stone,
          request.getDeclaredConstructors()[0].newInstance(BlockPos.ZERO, 42L, false),
          everyFace,
          collect);
      LOGGER.info("MINEMORIES-WRAPPED-MODEL {} quads={}", name, quads.size());
      if (quads.size() != 6)
        throw new AssertionError(name + " gave " + quads.size() + " quads, not 6");
  }
}
