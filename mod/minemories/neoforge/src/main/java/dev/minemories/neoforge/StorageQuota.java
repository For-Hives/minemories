package dev.minemories.neoforge;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.Locale;

record StorageQuota(
    long usedBytes,
    long limitBytes,
    long availableBytes,
    long reservedBytes,
    long pendingDeletionBytes) {
  static final String NO_SPACE_MESSAGE =
      "Espace insuffisant. GLB conservé en local. Supprime définitivement des captures de la corbeille sur le site, puis réessaie /minemories upload.";
  static final String CLEANUP_HELP =
      "Un refus d’envoi conserve ton GLB local. Pour libérer de l’espace, supprime définitivement des captures de la corbeille sur le site. Puis réessaie /minemories upload. Les effacements en attente doivent se terminer.";
  private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;

  StorageQuota {
    if (usedBytes < 0
        || limitBytes < 1
        || availableBytes != Math.max(0, limitBytes - usedBytes)
        || reservedBytes < 0
        || pendingDeletionBytes < 0
        || reservedBytes > usedBytes
        || pendingDeletionBytes > usedBytes - reservedBytes
        || usedBytes > MAX_SAFE_INTEGER
        || limitBytes > MAX_SAFE_INTEGER) {
      throw new IllegalArgumentException("Résumé de stockage invalide.");
    }
  }

  static StorageQuota parseStatus(String json) {
    JsonObject status = JsonParser.parseString(json).getAsJsonObject();
    JsonElement paired = status.get("paired");
    if (paired == null
        || !paired.isJsonPrimitive()
        || !paired.getAsJsonPrimitive().isBoolean()
        || !paired.getAsBoolean()) {
      throw new IllegalArgumentException("Connexion non confirmée.");
    }
    JsonObject storage = status.getAsJsonObject("storage");
    return new StorageQuota(
        quantity(storage, "usedBytes"),
        quantity(storage, "limitBytes"),
        quantity(storage, "availableBytes"),
        quantity(storage, "reservedBytes"),
        quantity(storage, "pendingDeletionBytes"));
  }

  private static long quantity(JsonObject storage, String key) {
    JsonElement value = storage == null ? null : storage.get(key);
    if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) {
      throw new IllegalArgumentException("Résumé de stockage invalide.");
    }
    return value.getAsBigDecimal().longValueExact();
  }

  String availableLabel() {
    return "Libre : " + formatBytes(availableBytes) + " / " + formatBytes(limitBytes);
  }

  static String formatBytes(long bytes) {
    if (bytes < 1000) return bytes + " o";
    String[] units = {"Ko", "Mo", "Go", "To", "Po"};
    double amount = bytes / 1000.0;
    int index = 0;
    while (amount >= 1000 && index < units.length - 1) {
      amount /= 1000;
      index++;
    }
    return String.format(Locale.FRANCE, "%.1f %s", amount, units[index]);
  }
}
