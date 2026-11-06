package dev.minemories.gametest;

import net.minecraftforge.common.MinecraftForge;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.fml.common.Mod;

/** Forge test mod: opens a Minemories screen and checks its background (dev run only). */
@Mod("minemories_gametest")
public final class ForgeGameTestMod {
  public ForgeGameTestMod() {
    if (!Boolean.getBoolean("minemories.gametest")) return;
    MinecraftForge.EVENT_BUS.addListener(
        (TickEvent.ClientTickEvent event) -> {
          if (event.phase == TickEvent.Phase.END) ScreenBackgroundCheck.tick();
        });
  }
}
