package dev.minemories.gametest;

import net.minecraftforge.event.TickEvent;
import net.minecraftforge.fml.common.Mod;

/** Forge test mod: drives the capture scenario from the client tick (dev run only). */
@Mod("minemories_gametest")
public final class ForgeGameTestMod {
  public ForgeGameTestMod() {
    if (!Boolean.getBoolean("minemories.gametest")) return;
    TickEvent.ClientTickEvent.Post.BUS.addListener(event -> TickDrivenCapture.tick());
  }
}
