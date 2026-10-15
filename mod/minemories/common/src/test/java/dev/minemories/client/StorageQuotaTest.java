package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.List;
import org.junit.jupiter.api.Test;

class StorageQuotaTest {
  private static final String VALID =
      "{\"paired\":true,\"storage\":{\"usedBytes\":300,\"limitBytes\":1024,\"availableBytes\":724,\"reservedBytes\":100,\"pendingDeletionBytes\":20}}";

  @Test
  void acceptsEmptyAndHistoricalOverQuotaAccountsWithoutNegativeAvailability() {
    assertEquals("Libre : 724 o / 1,0 Ko", StorageQuota.parseStatus(VALID).availableLabel());
    assertEquals(0, new StorageQuota(2048, 1024, 0, 100, 20).availableBytes());
    assertEquals(1024, new StorageQuota(0, 1024, 1024, 0, 0).availableBytes());
    assertEquals("0 o", StorageQuota.formatBytes(0));
    assertEquals("1,5 Mo", StorageQuota.formatBytes(1_500_000));
    assertEquals("2,1 Go", StorageQuota.formatBytes(2_147_483_648L));
    assertEquals("1,0 To", StorageQuota.formatBytes(1_000_000_000_000L));
    assertEquals("9,0 Po", StorageQuota.formatBytes(9_007_199_254_740_991L));
  }

  @Test
  void rejectsMissingFieldsStringsFractionsUnsafeValuesAndBrokenAccounting() {
    for (String field :
        List.of(
            "usedBytes", "limitBytes", "availableBytes", "reservedBytes", "pendingDeletionBytes")) {
      for (String invalid :
          List.of(
              "null", "\"12\"", "true", "[]", "{}", "-1", "1.5", "9007199254740992", "1e1000")) {
        JsonObject status = JsonParser.parseString(VALID).getAsJsonObject();
        status.getAsJsonObject("storage").add(field, JsonParser.parseString(invalid));
        assertThrows(
            RuntimeException.class,
            () -> StorageQuota.parseStatus(status.toString()),
            field + "=" + invalid);
      }
      JsonObject status = JsonParser.parseString(VALID).getAsJsonObject();
      status.getAsJsonObject("storage").remove(field);
      assertThrows(RuntimeException.class, () -> StorageQuota.parseStatus(status.toString()));
    }
    assertThrows(IllegalArgumentException.class, () -> new StorageQuota(0, 0, 0, 0, 0));
    assertThrows(IllegalArgumentException.class, () -> new StorageQuota(300, 1024, 1, 0, 0));
    assertThrows(IllegalArgumentException.class, () -> new StorageQuota(300, 1024, 724, 301, 0));
    assertThrows(IllegalArgumentException.class, () -> new StorageQuota(300, 1024, 724, 100, 201));
    assertThrows(RuntimeException.class, () -> StorageQuota.parseStatus("{\"paired\":false}"));
    assertThrows(RuntimeException.class, () -> StorageQuota.parseStatus("{\"paired\":\"true\"}"));
    assertThrows(RuntimeException.class, () -> StorageQuota.parseStatus("{}"));
    assertThrows(RuntimeException.class, () -> StorageQuota.parseStatus("<html>"));
  }
}
