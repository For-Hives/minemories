package dev.minemories.gametest;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;

/** Fabric test mod: drives the capture scenario and the screen check from the client tick (dev run only). */
public final class FabricGameTestMod implements ClientModInitializer {
  @Override
  public void onInitializeClient() {
    if (!Boolean.getBoolean("minemories.gametest")) return;
    ClientTickEvents.END_CLIENT_TICK.register(client -> TickDrivenCapture.tick());
  }
}
