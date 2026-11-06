package dev.minemories.compat;

import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.TextComponent;
import net.minecraft.network.chat.TranslatableComponent;

/** {@code Component.literal} and {@code Component.translatable}, which arrived in Minecraft 1.19. */
public final class Components {
  private Components() {}

  public static MutableComponent literal(String text) {
    return new TextComponent(text);
  }

  public static MutableComponent translatable(String key, Object... args) {
    return new TranslatableComponent(key, args);
  }
}
