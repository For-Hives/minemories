package dev.minemories.forge;

import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.loading.FMLEnvironment;

@Mod("minemories")
public final class MinemoriesForge {
  public MinemoriesForge() {
    if (FMLEnvironment.dist.isClient()) ForgeClient.initialize();
  }
}
