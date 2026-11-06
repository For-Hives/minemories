package dev.minemories.compat;

import net.minecraft.network.chat.Component;

/** Stand-in for the widget tooltip added in 1.19.3; {@link Tooltips} draws it. */
public final class Tooltip {
  final Component text;

  private Tooltip(Component text) {
    this.text = text;
  }

  public static Tooltip create(Component text) {
    return new Tooltip(text);
  }
}
