package dev.minemories.client;

import java.util.List;
import java.util.function.Function;
import java.util.function.Predicate;

/**
 * Keeps the Minemories menu on the key that types "m". Minecraft binds keys by their place on a US
 * keyboard, so the default M is the comma on AZERTY: the menu follows the letter instead.
 */
final class MenuKey {
  static final String DEFAULT = "key.keyboard.m";

  /** Every key that types a character, by the name options.txt saves. Letters come first. */
  static final List<String> PRINTABLE =
      List.of(
          "key.keyboard.a",
          "key.keyboard.b",
          "key.keyboard.c",
          "key.keyboard.d",
          "key.keyboard.e",
          "key.keyboard.f",
          "key.keyboard.g",
          "key.keyboard.h",
          "key.keyboard.i",
          "key.keyboard.j",
          "key.keyboard.k",
          "key.keyboard.l",
          "key.keyboard.m",
          "key.keyboard.n",
          "key.keyboard.o",
          "key.keyboard.p",
          "key.keyboard.q",
          "key.keyboard.r",
          "key.keyboard.s",
          "key.keyboard.t",
          "key.keyboard.u",
          "key.keyboard.v",
          "key.keyboard.w",
          "key.keyboard.x",
          "key.keyboard.y",
          "key.keyboard.z",
          "key.keyboard.semicolon",
          "key.keyboard.comma",
          "key.keyboard.period",
          "key.keyboard.slash",
          "key.keyboard.apostrophe",
          "key.keyboard.left.bracket",
          "key.keyboard.right.bracket",
          "key.keyboard.backslash",
          "key.keyboard.grave.accent",
          "key.keyboard.minus",
          "key.keyboard.equal",
          "key.keyboard.world.1",
          "key.keyboard.world.2",
          "key.keyboard.0",
          "key.keyboard.1",
          "key.keyboard.2",
          "key.keyboard.3",
          "key.keyboard.4",
          "key.keyboard.5",
          "key.keyboard.6",
          "key.keyboard.7",
          "key.keyboard.8",
          "key.keyboard.9");

  private MenuKey() {}

  /**
   * The key the menu should move to, or null to leave it where it is. A key the player chose is
   * never moved, and the menu never takes a key another binding already uses.
   *
   * @param onDefault whether the menu is still on its default key
   * @param typed the character a key types on this keyboard, as Minecraft shows it
   * @param taken whether another binding already uses a key
   */
  static String follow(boolean onDefault, Function<String, String> typed, Predicate<String> taken) {
    if (!onDefault) return null;
    for (String key : PRINTABLE) {
      String shown = typed.apply(key);
      if (shown == null || !"m".equalsIgnoreCase(shown.strip())) continue;
      return key.equals(DEFAULT) || taken.test(key) ? null : key;
    }
    return null;
  }
}
