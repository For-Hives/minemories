package dev.minemories.gametest.neoforge;

import dev.minemories.gametest.TickDrivenCapture;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.client.event.ClientTickEvent;

/** NeoForge has no client game test API: the shared state machine runs from the client tick. */
@Mod(value = "minemories_gametest", dist = Dist.CLIENT)
@EventBusSubscriber(modid = "minemories_gametest", value = Dist.CLIENT)
public final class CaptureTest {
  @SubscribeEvent
  public static void tick(ClientTickEvent.Post event) {
    TickDrivenCapture.tick();
  }
}
