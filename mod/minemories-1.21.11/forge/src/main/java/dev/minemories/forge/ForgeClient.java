package dev.minemories.forge;

import com.mojang.blaze3d.framegraph.FramePass;
import com.mojang.blaze3d.vertex.PoseStack;
import dev.minemories.client.ClientRuntime;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.LevelTargetBundle;
import net.minecraft.client.renderer.state.LevelRenderState;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.ResourceManagerReloadListener;
import net.minecraftforge.client.FramePassManager;
import net.minecraftforge.client.event.AddFramePassEvent;
import net.minecraftforge.client.event.InputEvent;
import net.minecraftforge.client.event.RegisterClientCommandsEvent;
import net.minecraftforge.client.event.RegisterClientReloadListenersEvent;
import net.minecraftforge.client.event.RegisterKeyMappingsEvent;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.event.TickEvent;

/**
 * Forge 61 uses EventBus 7: every event owns its BUS, so listeners are registered explicitly
 * instead of through annotations.
 */
public final class ForgeClient {
  private ForgeClient() {}

  public static void initialize() {
    ClientRuntime.initialize(new ForgePlatform());
    RegisterClientReloadListenersEvent.BUS.addListener(
        event ->
            event.registerReloadListener(
                (ResourceManagerReloadListener) resources -> ClientRuntime.resourcesReloaded()));
    RegisterKeyMappingsEvent.BUS.addListener(
        event -> ClientRuntime.registerOpenScreenKey(event::register));
    RegisterClientCommandsEvent.BUS.addListener(
        event -> ClientRuntime.registerCommands(event.getDispatcher()));
    ScreenEvent.Init.Post.BUS.addListener(
        event -> {
          ClientRuntime.addPauseMenuButton(
              event.getScreen(), event::addListener, event.getListenersList());
          ClientRuntime.addOptionsButton(
              event.getScreen(), event::addListener, event.getListenersList());
        });
    ScreenEvent.Render.Pre.BUS.addListener(
        event -> {
          ClientRuntime.repositionPauseMenuButton(event.getScreen());
          return false;
        });
    TickEvent.ClientTickEvent.Post.BUS.addListener(event -> ClientRuntime.openFromShortcut());
    InputEvent.Key.BUS.addListener(event -> ClientRuntime.trackAfkKeyboard(event.getAction()));
    InputEvent.MouseButton.Pre.BUS.addListener(
        event -> {
          ClientRuntime.trackAfkMouse(event.getAction());
          return false;
        });
    TickEvent.RenderTickEvent.Post.BUS.addListener(event -> ClientRuntime.trackAfkSnapshot());
    // Forge 61 has no render-stage event; a frame pass on the main target draws the selection.
    AddFramePassEvent.BUS.addListener(
        event ->
            event.addPass(
                Identifier.fromNamespaceAndPath("minemories", "selection"), new SelectionPass()));
  }

  private static final class SelectionPass implements FramePassManager.PassDefinition {
    @Override
    public void extracts(LevelTargetBundle bundle, FramePass pass, DeltaTracker deltaTracker) {
      bundle.main = pass.readsAndWrites(bundle.main);
    }

    @Override
    public void executes(LevelRenderState state) {
      ClientRuntime.renderSelection(
          new PoseStack(), Minecraft.getInstance().gameRenderer.getMainCamera().position());
    }
  }
}
