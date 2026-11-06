package dev.minemories.forge;

import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.fml.DistExecutor;
import net.minecraftforge.fml.common.Mod;

@Mod("minemories")
public final class MinemoriesForge {
  public MinemoriesForge() {
    DistExecutor.safeRunWhenOn(Dist.CLIENT, () -> ForgeClient::initialize);
  }
}
