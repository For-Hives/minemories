package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ChunkedUploaderTest {
  @TempDir Path temporary;
  private HttpServer server;

  @AfterEach
  void stop() {
    if (server != null) server.stop(0);
  }

  private String start(com.sun.net.httpserver.HttpHandler handler) throws IOException {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.createContext("/api/mod/uploads", handler);
    server.start();
    return "http://127.0.0.1:" + server.getAddress().getPort();
  }

  private static void respond(HttpExchange exchange, int status, String body) throws IOException {
    byte[] bytes = body.getBytes(java.nio.charset.StandardCharsets.UTF_8);
    exchange.sendResponseHeaders(status, bytes.length);
    try (var output = exchange.getResponseBody()) {
      output.write(bytes);
    }
  }

  private static String session(long offset, boolean completed) {
    return "{\"offset\":"
        + offset
        + ",\"chunkSize\":"
        + ChunkedUploader.CHUNK_BYTES
        + ",\"completed\":"
        + completed
        + "}";
  }

  private ChunkedUploader uploader() {
    return new ChunkedUploader(
        HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build(), 0);
  }

  private Path capture(int size) throws IOException {
    Path file = temporary.resolve("capture.glb");
    byte[] bytes = new byte[size];
    Arrays.fill(bytes, (byte) 42);
    Files.write(file, bytes);
    return file;
  }

  @Test
  void retriesLostAcknowledgementWithoutDuplicatingChunksOrFinalization() throws Exception {
    int size = ChunkedUploader.CHUNK_BYTES + 20;
    Path file = capture(size);
    AtomicInteger chunks = new AtomicInteger();
    AtomicInteger completes = new AtomicInteger();
    List<Long> offsets = new ArrayList<>();
    List<Long> progress = new ArrayList<>();
    String url =
        start(
            exchange -> {
              assertEquals(
                  "Bearer test-token", exchange.getRequestHeaders().getFirst("Authorization"));
              if (exchange.getRequestURI().getPath().endsWith("/complete")) {
                int attempt = completes.incrementAndGet();
                respond(
                    exchange, attempt == 1 ? 503 : 200, attempt == 1 ? "{}" : "{\"id\":\"saved\"}");
              } else if (exchange.getRequestMethod().equals("PUT")) {
                long offset =
                    Long.parseLong(exchange.getRequestHeaders().getFirst("Upload-Offset"));
                byte[] bytes = exchange.getRequestBody().readAllBytes();
                assertTrue(bytes.length <= ChunkedUploader.CHUNK_BYTES);
                assertEquals(42, bytes[0]);
                offsets.add(offset);
                int attempt = chunks.incrementAndGet();
                respond(
                    exchange,
                    attempt == 1 ? 503 : 200,
                    attempt == 1 ? "{}" : session(offset + bytes.length, false));
              } else {
                JsonObject input =
                    JsonParser.parseString(
                            new String(
                                exchange.getRequestBody().readAllBytes(),
                                java.nio.charset.StandardCharsets.UTF_8))
                        .getAsJsonObject();
                assertEquals(size, input.get("size").getAsInt());
                assertEquals(64, input.get("sha256").getAsString().length());
                respond(exchange, 201, session(0, false));
              }
            });
    uploader().upload(url, "test-token", file, new JsonObject(), progress::add);
    assertEquals(List.of(0L, 0L, (long) ChunkedUploader.CHUNK_BYTES), offsets);
    assertEquals(List.of(0L, (long) ChunkedUploader.CHUNK_BYTES, (long) size), progress);
    assertEquals(2, completes.get());
    assertFalse(Files.exists(file.resolveSibling("capture.glb.upload.properties")));
  }

  @Test
  void resumesPersistedSessionAfterRetriesAreExhausted() throws Exception {
    int size = ChunkedUploader.CHUNK_BYTES + 20;
    Path file = capture(size);
    AtomicInteger acceptedOffset = new AtomicInteger();
    AtomicInteger initialization = new AtomicInteger();
    List<String> ids = new ArrayList<>();
    List<Long> offsets = new ArrayList<>();
    String url =
        start(
            exchange -> {
              if (exchange.getRequestURI().getPath().endsWith("/complete")) {
                respond(exchange, 201, "{}");
              } else if (exchange.getRequestMethod().equals("PUT")) {
                long offset =
                    Long.parseLong(exchange.getRequestHeaders().getFirst("Upload-Offset"));
                byte[] bytes = exchange.getRequestBody().readAllBytes();
                offsets.add(offset);
                if (offset > 0 && initialization.get() == 1) {
                  respond(exchange, 503, "{}");
                  return;
                }
                acceptedOffset.set((int) offset + bytes.length);
                respond(exchange, 200, session(acceptedOffset.get(), false));
              } else {
                initialization.incrementAndGet();
                JsonObject input =
                    JsonParser.parseString(
                            new String(
                                exchange.getRequestBody().readAllBytes(),
                                java.nio.charset.StandardCharsets.UTF_8))
                        .getAsJsonObject();
                ids.add(input.get("id").getAsString());
                respond(exchange, 200, session(acceptedOffset.get(), false));
              }
            });
    assertThrows(
        IOException.class,
        () -> uploader().upload(url, "test-token", file, new JsonObject(), ignored -> {}));
    Path state = file.resolveSibling("capture.glb.upload.properties");
    assertTrue(Files.exists(state));
    assertFalse(Files.readString(state).contains("test-token"));
    uploader().upload(url, "test-token", file, new JsonObject(), ignored -> {});
    assertEquals(ids.get(0), ids.get(1));
    assertEquals(5, offsets.size());
    assertEquals((long) ChunkedUploader.CHUNK_BYTES, offsets.get(4));
    assertFalse(Files.exists(state));
  }

  @Test
  void permanentAuthorizationFailureIsNotRetried() throws Exception {
    Path file = capture(20);
    AtomicInteger calls = new AtomicInteger();
    String url =
        start(
            exchange -> {
              calls.incrementAndGet();
              respond(exchange, 401, "{}");
            });
    assertThrows(
        IOException.class,
        () -> uploader().upload(url, "bad-token", file, new JsonObject(), ignored -> {}));
    assertEquals(1, calls.get());
  }

  @Test
  void rejectsOversizedFileBeforeContactingServer() throws Exception {
    Path file = temporary.resolve("large.glb");
    try (var output = new java.io.RandomAccessFile(file.toFile(), "rw")) {
      output.setLength(ChunkedUploader.MAX_BYTES + 1);
    }
    assertThrows(
        IOException.class,
        () ->
            uploader()
                .upload("http://127.0.0.1:1", "token", file, new JsonObject(), ignored -> {}));
  }

  @Test
  void completedSessionDoesNotSendChunksAgain() throws Exception {
    Path file = capture(20);
    AtomicInteger calls = new AtomicInteger();
    String url =
        start(
            exchange -> {
              calls.incrementAndGet();
              respond(exchange, 200, session(20, true));
            });
    uploader().upload(url, "token", file, new JsonObject(), ignored -> {});
    assertEquals(1, calls.get());
  }

  @Test
  void rejectsAnInvalidServerOffset() throws Exception {
    Path file = capture(20);
    String url = start(exchange -> respond(exchange, 200, session(21, false)));
    assertThrows(
        IOException.class,
        () -> uploader().upload(url, "token", file, new JsonObject(), ignored -> {}));
  }
}
