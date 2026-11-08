package dev.minemories.client;

import java.util.function.IntConsumer;
import java.util.function.IntFunction;
import net.minecraft.client.gui.components.AbstractSliderButton;
import net.minecraft.network.chat.Component;

/** A slider over a fixed list of values, like Minecraft's own volume sliders. */
final class ValueSlider extends AbstractSliderButton {
  private final int[] steps;
  private final IntFunction<Component> label;
  private final IntConsumer onChange;

  ValueSlider(
      int x,
      int y,
      int width,
      int[] steps,
      int current,
      IntFunction<Component> label,
      IntConsumer onChange) {
    super(
        x,
        y,
        width,
        20,
        Component.literal(""),
        SettingSteps.position(steps, SettingSteps.nearestIndex(steps, current)));
    this.steps = steps;
    this.label = label;
    this.onChange = onChange;
    updateMessage();
  }

  int selected() {
    return steps[SettingSteps.indexAt(steps, value)];
  }

  @Override
  protected void updateMessage() {
    setMessage(label.apply(selected()));
  }

  @Override
  protected void applyValue() {
    // Snap to the step so the handle always sits on a value the label can show.
    value = SettingSteps.position(steps, SettingSteps.indexAt(steps, value));
    onChange.accept(selected());
  }
}
