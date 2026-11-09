package dev.minemories.fabric;

import dev.minemories.client.ClientRuntime;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.command.v2.ClientCommandRegistrationCallback;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.fabricmc.fabric.api.resource.ResourceManagerHelper;
import net.fabricmc.fabric.api.resource.SimpleSynchronousResourceReloadListener;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.resources.ResourceManager;

public final class MinemoriesFabric implements ClientModInitializer {
  @Override
  public void onInitializeClient() {
    ClientRuntime.initialize(new FabricPlatform());
    ClientRuntime.registerOpenScreenKey(KeyMappingHelper::registerKeyMapping);
    ClientCommandRegistrationCallback.EVENT.register(
        (dispatcher, registryAccess) -> ClientRuntime.registerCommands(dispatcher));
    ClientTickEvents.END_CLIENT_TICK.register(client -> ClientRuntime.openFromShortcut());
    ScreenEvents.AFTER_INIT.register(
        (client, screen, width, height) -> {
          ClientRuntime.addPauseMenuButton(
              screen, button -> Screens.getWidgets(screen).add(button), screen.children());
          ClientRuntime.addOptionsButton(
              screen, button -> Screens.getWidgets(screen).add(button), screen.children());
          ScreenEvents.beforeExtract(screen)
              .register(
                  (value, graphics, mouseX, mouseY, delta) ->
                      ClientRuntime.repositionPauseMenuButton(value));
        });
    LevelRenderEvents.BEFORE_GIZMOS.register(context -> ClientRuntime.renderSelection());
    ResourceManagerHelper.get(PackType.CLIENT_RESOURCES)
        .registerReloadListener(
            new SimpleSynchronousResourceReloadListener() {
              @Override
              public Identifier getFabricId() {
                return Identifier.fromNamespaceAndPath("minemories", "capture");
              }

              @Override
              public void onResourceManagerReload(ResourceManager manager) {
                ClientRuntime.resourcesReloaded();
              }
            });
  }
}
