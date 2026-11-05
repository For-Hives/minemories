package dev.minemories.gametest;

import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.fml.common.Mod;

/** Forge test mod: drives the capture scenario and the screen check (dev run only). */
@Mod("minemories_gametest")
public final class ForgeGameTestMod {
  public ForgeGameTestMod() {
    if (!Boolean.getBoolean("minemories.gametest")) return;
    MinecraftForge.EVENT_BUS.addListener(
        (TickEvent.ClientTickEvent event) -> {
          if (event.phase == TickEvent.Phase.END) TickDrivenCapture.tick();
        });
  }
}
