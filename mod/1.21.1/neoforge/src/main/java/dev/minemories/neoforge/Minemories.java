package dev.minemories.neoforge;

import dev.minemories.client.ClientRuntime;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.client.event.ClientTickEvent;
import net.neoforged.neoforge.client.event.InputEvent;
import net.neoforged.neoforge.client.event.RegisterClientCommandsEvent;
import net.neoforged.neoforge.client.event.RegisterKeyMappingsEvent;
import net.neoforged.neoforge.client.event.RenderFrameEvent;
import net.neoforged.neoforge.client.event.RenderLevelStageEvent;
import net.neoforged.neoforge.client.event.ScreenEvent;

@Mod(value = "minemories", dist = net.neoforged.api.distmarker.Dist.CLIENT)
@EventBusSubscriber(
    modid = "minemories",
    bus = EventBusSubscriber.Bus.GAME,
    value = net.neoforged.api.distmarker.Dist.CLIENT)
public final class Minemories {
  public Minemories() {
    ClientRuntime.initialize(new NeoForgePlatform());
  }

  @EventBusSubscriber(
      modid = "minemories",
      bus = EventBusSubscriber.Bus.MOD,
      value = net.neoforged.api.distmarker.Dist.CLIENT)
  public static final class ClientKeys {
    @SubscribeEvent
    public static void reloadResources(
        net.neoforged.neoforge.client.event.RegisterClientReloadListenersEvent event) {
      event.registerReloadListener(
          (net.minecraft.server.packs.resources.ResourceManagerReloadListener)
              resources -> ClientRuntime.resourcesReloaded());
    }

    @SubscribeEvent
    public static void registerKeys(RegisterKeyMappingsEvent event) {
      ClientRuntime.registerOpenScreenKey(event::register);
    }
  }

  @SubscribeEvent
  public static void registerCommands(RegisterClientCommandsEvent event) {
    ClientRuntime.registerCommands(event.getDispatcher());
  }

  @SubscribeEvent
  public static void addPauseMenuButton(ScreenEvent.Init.Post event) {
    ClientRuntime.addPauseMenuButton(
        event.getScreen(), event::addListener, event.getListenersList());
  }

  @SubscribeEvent
  public static void addOptionsButton(ScreenEvent.Init.Post event) {
    ClientRuntime.addOptionsButton(event.getScreen(), event::addListener, event.getListenersList());
  }

  @SubscribeEvent
  public static void repositionPauseMenuButton(ScreenEvent.Render.Pre event) {
    ClientRuntime.repositionPauseMenuButton(event.getScreen());
  }

  @SubscribeEvent
  public static void openFromShortcut(ClientTickEvent.Post event) {
    ClientRuntime.openFromShortcut();
  }

  @SubscribeEvent
  public static void trackAfkKeyboard(InputEvent.Key event) {
    ClientRuntime.trackAfkKeyboard(event.getAction());
  }

  @SubscribeEvent
  public static void trackAfkMouse(InputEvent.MouseButton.Pre event) {
    ClientRuntime.trackAfkMouse(event.getAction());
  }

  @SubscribeEvent
  public static void trackAfkSnapshot(RenderFrameEvent.Post event) {
    ClientRuntime.trackAfkSnapshot();
  }

  @SubscribeEvent
  public static void renderSelection(RenderLevelStageEvent event) {
    if (event.getStage() == RenderLevelStageEvent.Stage.AFTER_TRANSLUCENT_BLOCKS)
      ClientRuntime.renderSelection(event.getPoseStack(), event.getCamera().getPosition());
  }
}
