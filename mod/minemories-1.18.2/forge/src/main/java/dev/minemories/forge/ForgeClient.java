package dev.minemories.forge;

import dev.minemories.client.ClientRuntime;
import net.minecraftforge.client.ClientRegistry;
import net.minecraftforge.client.event.ScreenEvent;
import net.minecraftforge.client.event.InputEvent;
import net.minecraftforge.client.event.RegisterClientCommandsEvent;
import net.minecraftforge.client.event.RenderLevelLastEvent;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod.EventBusSubscriber;
import net.minecraftforge.fml.event.lifecycle.FMLClientSetupEvent;

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
    public static void registerKeys(FMLClientSetupEvent event) {
      event.enqueueWork(() -> ClientRuntime.registerOpenScreenKey(ClientRegistry::registerKeyBinding));
    }
  }

  @SubscribeEvent
  public static void registerCommands(RegisterClientCommandsEvent event) {
    ClientRuntime.registerCommands(event.getDispatcher());
  }

  @SubscribeEvent
  public static void addPauseMenuButton(ScreenEvent.InitScreenEvent.Post event) {
    ClientRuntime.addPauseMenuButton(
        event.getScreen(), event::addListener, event.getListenersList());
  }

  @SubscribeEvent
  public static void addOptionsButton(ScreenEvent.InitScreenEvent.Post event) {
    ClientRuntime.addOptionsButton(event.getScreen(), event::addListener, event.getListenersList());
  }

  @SubscribeEvent
  public static void repositionPauseMenuButton(ScreenEvent.DrawScreenEvent.Pre event) {
    ClientRuntime.repositionPauseMenuButton(event.getScreen());
  }

  @SubscribeEvent
  public static void openFromShortcut(TickEvent.ClientTickEvent event) {
    if (event.phase == TickEvent.Phase.END) ClientRuntime.openFromShortcut();
  }

  @SubscribeEvent
  public static void trackAfkKeyboard(InputEvent.KeyInputEvent event) {
    ClientRuntime.trackAfkKeyboard(event.getAction());
  }

  @SubscribeEvent
  public static void trackAfkMouse(InputEvent.MouseInputEvent event) {
    ClientRuntime.trackAfkMouse(event.getAction());
  }

  @SubscribeEvent
  public static void trackAfkSnapshot(TickEvent.RenderTickEvent event) {
    if (event.phase == TickEvent.Phase.END) ClientRuntime.trackAfkSnapshot();
  }

  @SubscribeEvent
  public static void renderSelection(RenderLevelLastEvent event) {
    ClientRuntime.renderSelection(
        event.getPoseStack(),
        net.minecraft.client.Minecraft.getInstance().gameRenderer.getMainCamera().getPosition());
  }
}
