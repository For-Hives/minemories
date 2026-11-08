package dev.minemories.client;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.Locale;

record StorageQuota(
    long usedBytes,
    long limitBytes,
    long availableBytes,
    long reservedBytes,
    long pendingDeletionBytes,
    String accountName) {
  StorageQuota(
      long usedBytes,
      long limitBytes,
      long availableBytes,
      long reservedBytes,
      long pendingDeletionBytes) {
    this(usedBytes, limitBytes, availableBytes, reservedBytes, pendingDeletionBytes, null);
  }

  static final String NO_SPACE_MESSAGE =
      "Not enough space. GLB kept locally. Permanently delete captures from the trash on the website, then retry /minemories upload.";
  static final String CLEANUP_HELP =
      "A refused upload keeps your local GLB. To free up space, permanently delete captures from the trash on the website. Then retry /minemories upload. Pending deletions must finish first.";
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
      throw new IllegalArgumentException("Invalid storage summary.");
    }
  }

  static StorageQuota parseStatus(String json) {
    JsonObject status = JsonParser.parseString(json).getAsJsonObject();
    JsonElement paired = status.get("paired");
    if (paired == null
        || !paired.isJsonPrimitive()
        || !paired.getAsJsonPrimitive().isBoolean()
        || !paired.getAsBoolean()) {
      throw new IllegalArgumentException("Connection not confirmed.");
    }
    JsonObject storage = status.getAsJsonObject("storage");
    return new StorageQuota(
        quantity(storage, "usedBytes"),
        quantity(storage, "limitBytes"),
        quantity(storage, "availableBytes"),
        quantity(storage, "reservedBytes"),
        quantity(storage, "pendingDeletionBytes"),
        accountName(status));
  }

  /** The account's display name when the API sends one; never trusted for more than a label. */
  private static String accountName(JsonObject status) {
    JsonElement account = status.get("account");
    if (account == null || !account.isJsonObject()) return null;
    JsonElement name = account.getAsJsonObject().get("name");
    if (name == null || !name.isJsonPrimitive() || !name.getAsJsonPrimitive().isString())
      return null;
    String value = name.getAsString().replaceAll("[\\p{Cntrl}§]", "").strip();
    if (value.isEmpty()) return null;
    return value.length() > 32 ? value.substring(0, 32) : value;
  }

  private static long quantity(JsonObject storage, String key) {
    JsonElement value = storage == null ? null : storage.get(key);
    if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isNumber()) {
      throw new IllegalArgumentException("Invalid storage summary.");
    }
    return value.getAsBigDecimal().longValueExact();
  }

  String availableLabel() {
    return "Free: " + formatBytes(availableBytes) + " / " + formatBytes(limitBytes);
  }

  static String formatBytes(long bytes) {
    if (bytes < 1000) return bytes + " B";
    String[] units = {"kB", "MB", "GB", "TB", "PB"};
    double amount = bytes / 1000.0;
    int index = 0;
    while (amount >= 1000 && index < units.length - 1) {
      amount /= 1000;
      index++;
    }
    return String.format(Locale.ROOT, "%.1f %s", amount, units[index]);
  }
}
