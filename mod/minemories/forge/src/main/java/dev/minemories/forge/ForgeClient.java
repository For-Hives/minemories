package dev.minemories.forge;

import dev.minemories.client.ClientRuntime;
import net.minecraftforge.client.event.InputEvent;
import net.minecraftforge.client.event.RegisterClientCommandsEvent;
import net.minecraftforge.client.event.RegisterKeyMappingsEvent;
import net.minecraftforge.client.event.RenderLevelStageEvent;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;

@EventBusSubscriber(
    modid = "minemories",
    bus = EventBusSubscriber.Bus.FORGE,
    value = net.minecraftforge.api.distmarker.Dist.CLIENT)
public final class ForgeClient {
  public static void initialize() {
    ClientRuntime.initialize(new ForgePlatform());
  }

  @EventBusSubscriber(
      modid = "minemories",
      bus = EventBusSubscriber.Bus.MOD,
      value = net.minecraftforge.api.distmarker.Dist.CLIENT)
  public static final class ClientKeys {
    @SubscribeEvent
    public static void reloadResources(
        net.minecraftforge.client.event.RegisterClientReloadListenersEvent event) {
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
  public static void openFromShortcut(TickEvent.ClientTickEvent.Post event) {
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
  public static void trackAfkSnapshot(TickEvent.RenderTickEvent.Post event) {
    ClientRuntime.trackAfkSnapshot();
  }

  @SubscribeEvent
  public static void renderSelection(RenderLevelStageEvent event) {
    if (event.getStage() == RenderLevelStageEvent.Stage.AFTER_TRANSLUCENT_BLOCKS) {
      var pose = new com.mojang.blaze3d.vertex.PoseStack();
      // Forge 52 exposes the model-view matrix through this legacy-named getter.
      pose.mulPose(event.getPoseStack());
      ClientRuntime.renderSelection(pose, event.getCamera().getPosition());
    }
  }
}
