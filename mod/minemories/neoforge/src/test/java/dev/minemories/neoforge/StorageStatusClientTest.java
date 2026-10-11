package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletionException;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

class StorageStatusClientTest {
  private static final String VALID =
      "{\"paired\":true,\"storage\":{\"usedBytes\":300,\"limitBytes\":1024,\"availableBytes\":724,\"reservedBytes\":100,\"pendingDeletionBytes\":20}}";
  private HttpServer server;

  @AfterEach
  void stop() {
    if (server != null) server.stop(0);
  }

  private String start(int status, String body, AtomicInteger calls) throws Exception {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext(
        "/api/mod/status",
        exchange -> {
          calls.incrementAndGet();
          assertEquals("GET", exchange.getRequestMethod());
          assertEquals(
              "Bearer private-device", exchange.getRequestHeaders().getFirst("Authorization"));
          byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
          exchange.sendResponseHeaders(status, 0);
          try (var output = exchange.getResponseBody()) {
            output.write(bytes);
          } catch (java.io.IOException ignored) {
            // The bounded subscriber cancels an oversized response.
          }
        });
    server.start();
    return "http://127.0.0.1:" + server.getAddress().getPort();
  }

  @Test
  void readsCustomApiQuotaFromAuthenticatedStatusAtTheByteLimit() throws Exception {
    AtomicInteger calls = new AtomicInteger();
    String body = VALID + " ".repeat(ApiResponseBody.MAX_BYTES - VALID.length());
    String api = start(200, body, calls);
    StorageQuota quota =
        StorageStatusClient.fetch(HttpClient.newHttpClient(), api, "private-device").join();
    assertEquals(new StorageQuota(300, 1024, 724, 100, 20), quota);
    assertEquals(1, calls.get());
  }

  @Test
  void unpairedRequestsDoNotContactTheApi() throws Exception {
    AtomicInteger calls = new AtomicInteger();
    String api = start(200, VALID, calls);
    assertThrows(
        CompletionException.class,
        () -> StorageStatusClient.fetch(HttpClient.newHttpClient(), api, " ").join());
    assertThrows(
        CompletionException.class,
        () -> StorageStatusClient.fetch(HttpClient.newHttpClient(), api, null).join());
    assertEquals(0, calls.get());
  }

  @Test
  void oldCustomApiWithoutStorageDoesNotInventAQuota() throws Exception {
    AtomicInteger calls = new AtomicInteger();
    String api = start(200, "{\"paired\":true}", calls);
    CompletionException error =
        assertThrows(
            CompletionException.class,
            () ->
                StorageStatusClient.fetch(HttpClient.newHttpClient(), api, "private-device")
                    .join());
    assertTrue(error.getCause().getMessage().contains("résumé de stockage valide"));
  }

  @Test
  void expiredPairingDoesNotReflectPrivateErrorBodies() throws Exception {
    String api = start(401, "{\"error\":\"private-device\"}", new AtomicInteger());
    CompletionException error =
        assertThrows(
            CompletionException.class,
            () ->
                StorageStatusClient.fetch(HttpClient.newHttpClient(), api, "private-device")
                    .join());
    assertEquals("Connexion expirée. Reconnecte ton compte.", error.getCause().getMessage());
  }

  @Test
  void chunkedMultibyteResponsesAreBoundedInBytes() throws Exception {
    String api = start(200, VALID + "€".repeat(ApiResponseBody.MAX_BYTES / 2), new AtomicInteger());
    CompletionException error =
        assertThrows(
            CompletionException.class,
            () ->
                StorageStatusClient.fetch(HttpClient.newHttpClient(), api, "private-device")
                    .join());
    assertTrue(error.getCause().getMessage().contains("trop volumineuse"));
  }
}
