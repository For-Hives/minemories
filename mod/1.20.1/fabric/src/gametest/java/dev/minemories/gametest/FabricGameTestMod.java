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
          wrapped,
          stone,
          request.getDeclaredConstructors()[0].newInstance(BlockPos.ZERO, 42L, false),
          everyFace,
          collect);
      LOGGER.info("MINEMORIES-WRAPPED-MODEL quads={}", quads.size());
      if (quads.size() != 6)
        throw new AssertionError("Wrapped stone model gave " + quads.size() + " quads, not 6");
    } catch (Throwable failure) {
      LOGGER.error("MINEMORIES-GAMETEST FAILED", failure);
      Runtime.getRuntime().halt(1);
    }
  }
}
