package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.Map;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

class MenuKeyTest {
  // What each key types on a French AZERTY keyboard, as Minecraft shows it (upper case).
  private static final Function<String, String> AZERTY =
      key ->
          Map.of(
                  "key.keyboard.a", "Q",
                  "key.keyboard.q", "A",
                  "key.keyboard.w", "Z",
                  "key.keyboard.z", "W",
                  "key.keyboard.m", ",",
                  "key.keyboard.semicolon", "M",
                  "key.keyboard.comma", ";")
              .getOrDefault(key, key.substring(key.lastIndexOf('.') + 1).toUpperCase());

  private static final Function<String, String> QWERTY =
      key -> key.substring(key.lastIndexOf('.') + 1).toUpperCase();

  @Test
  void onAzertyTheMenuMovesToTheKeyThatTypesM() {
    assertEquals("key.keyboard.semicolon", MenuKey.follow(true, AZERTY, key -> false));
  }

  @Test
  void onQwertyTheMenuStaysOnM() {
    assertNull(MenuKey.follow(true, QWERTY, key -> false));
  }

  @Test
  void aKeyThePlayerChoseIsNeverMoved() {
    assertNull(MenuKey.follow(false, AZERTY, key -> false));
  }

  @Test
  void theMenuNeverTakesAKeyAnotherBindingUses() {
    assertNull(MenuKey.follow(true, AZERTY, "key.keyboard.semicolon"::equals));
  }

  @Test
  void keysWithoutANameAreSkipped() {
    assertNull(MenuKey.follow(true, key -> null, key -> false));
    assertNull(MenuKey.follow(true, key -> "", key -> false));
  }

  @Test
  void everyPrintableKeyIsListedOnce() {
    assertEquals(MenuKey.PRINTABLE.size(), new java.util.HashSet<>(MenuKey.PRINTABLE).size());
    assertEquals(MenuKey.DEFAULT, MenuKey.PRINTABLE.get(12));
  }
}
