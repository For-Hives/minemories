package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import net.minecraft.locale.Language;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.FormattedText;
import net.minecraft.util.FormattedCharSequence;
import org.junit.jupiter.api.Test;

final class OptionsLocalizationTest {
  private static final List<String> LOCALES =
      List.of(
          "en_us", "en_gb", "en_ca", "fr_fr", "fr_ca", "ru_ru", "de_de", "ko_kr", "pt_br", "pl_pl",
          "ja_jp");

  private static JsonObject catalog(String locale) throws IOException {
    var stream =
        OptionsLocalizationTest.class.getResourceAsStream(
            "/assets/minemories/lang/" + locale + ".json");
    assertNotNull(stream, locale);
    try (var reader = new InputStreamReader(stream, StandardCharsets.UTF_8)) {
      return JsonParser.parseReader(reader).getAsJsonObject();
    }
  }

  @Test
  void everyGameLanguageContainsAllOptionsAndKeepsCommandsAndPaths() throws IOException {
    var english = catalog("en_us");
    for (String locale : LOCALES) {
      var messages = catalog(locale);
      assertEquals(english.keySet(), messages.keySet(), locale);
      for (String key : english.keySet()) {
        String text = messages.get(key).getAsString();
        assertFalse(text.isBlank(), locale + ": " + key);
        // "history" is a directory name only in the export-path hint, not in ordinary prose.
        if (english.get(key).getAsString().contains("capture.glb")) {
          assertTrue(text.contains("history"), locale + ": " + key);
        }
        for (String token :
            List.of(
                "/minemories select first", "second", "~/export", "capture.glb", "UUID", "HTTPS")) {
          if (english.get(key).getAsString().contains(token)) {
            assertTrue(text.contains(token), locale + ": " + key + " lost " + token);
          }
        }
      }
    }
  }

  @Test
  void existingOptionComponentResolvesAgainWhenMinecraftChangesItsLanguage() throws IOException {
    Language previous = Language.getInstance();
    Component option = Component.translatable("minemories.ui.reglages_afk");
    Component depth =
        Component.translatable(
            "minemories.options.depth", Component.translatable("minemories.ui.toute_la_dimension"));
    try {
      for (String locale : LOCALES) {
        JsonObject messages = catalog(locale);
        Language.inject(new CatalogLanguage(messages));
        assertEquals(messages.get("minemories.ui.reglages_afk").getAsString(), option.getString());
        assertEquals(
            messages
                .get("minemories.options.depth")
                .getAsString()
                .replace("%s", messages.get("minemories.ui.toute_la_dimension").getAsString()),
            depth.getString());
      }
    } finally {
      Language.inject(previous);
    }
  }

  private static final class CatalogLanguage extends Language {
    private final JsonObject messages;

    private CatalogLanguage(JsonObject messages) {
      this.messages = messages;
    }

    @Override
    public String getOrDefault(String key, String fallback) {
      return messages.has(key) ? messages.get(key).getAsString() : fallback;
    }

    @Override
    public boolean has(String key) {
      return messages.has(key);
    }

    @Override
    public boolean isDefaultRightToLeft() {
      return false;
    }

    @Override
    public FormattedCharSequence getVisualOrder(FormattedText text) {
      return FormattedCharSequence.EMPTY;
    }
  }
}
