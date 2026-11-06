package dev.minemories.fabric;

import dev.minemories.client.ClientRuntime;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.fabricmc.fabric.api.resource.ResourceManagerHelper;
import net.fabricmc.fabric.api.resource.SimpleSynchronousResourceReloadListener;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.resources.ResourceManager;

public final class MinemoriesFabric implements ClientModInitializer {
  @Override
  public void onInitializeClient() {
    ClientRuntime.initialize(new FabricPlatform());
    ClientRuntime.registerOpenScreenKey(KeyBindingHelper::registerKeyBinding);
    ClientCommandRegistrationCallback.EVENT.register(
        (dispatcher, registryAccess) -> ClientRuntime.registerCommands(dispatcher));
    ClientTickEvents.END_CLIENT_TICK.register(client -> ClientRuntime.openFromShortcut());
    ScreenEvents.AFTER_INIT.register(
        (client, screen, width, height) -> {
          ClientRuntime.addPauseMenuButton(
              screen, button -> Screens.getButtons(screen).add(button), screen.children());
          ClientRuntime.addOptionsButton(
              screen, button -> Screens.getButtons(screen).add(button), screen.children());
          ScreenEvents.beforeRender(screen)
              .register(
                  (value, graphics, mouseX, mouseY, delta) ->
                      ClientRuntime.repositionPauseMenuButton(value));
        });
    WorldRenderEvents.AFTER_TRANSLUCENT.register(
        context -> {
          if (context.matrixStack() != null)
            ClientRuntime.renderSelection(context.matrixStack(), context.camera().getPosition());
        });
    ResourceManagerHelper.get(PackType.CLIENT_RESOURCES)
        .registerReloadListener(
            new SimpleSynchronousResourceReloadListener() {
              @Override
              public ResourceLocation getFabricId() {
                return ResourceLocation.fromNamespaceAndPath("minemories", "capture");
              }

              @Override
              public void onResourceManagerReload(ResourceManager manager) {
                ClientRuntime.resourcesReloaded();
              }
            });
  }
}
