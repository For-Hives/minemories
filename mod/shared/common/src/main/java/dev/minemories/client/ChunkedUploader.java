package dev.minemories.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Properties;
import java.util.UUID;
import java.util.function.LongConsumer;
import java.util.function.UnaryOperator;

/** Sequential, resumable upload; only one 4 MiB chunk is retained at a time. */
final class ChunkedUploader {
  static final long MAX_BYTES = 450L * 1024 * 1024;
  static final int CHUNK_BYTES = 4 * 1024 * 1024;

  interface BeforeRequest {
    void check(HttpRequest request) throws IOException, InterruptedException;
  }

  private final BeforeRequest beforeRequest;
  private final HttpClient http;
  private final UploadPacer pacer;
  private final long retryDelayMillis;
  private volatile DiagnosticReport.Http lastHttp;
  private final UnaryOperator<HttpRequest.Builder> diagnosticHeaders;

  ChunkedUploader(HttpClient http, long retryDelayMillis) {
    this(http, retryDelayMillis, UnaryOperator.identity());
  }

  ChunkedUploader(
      HttpClient http,
      long retryDelayMillis,
      UnaryOperator<HttpRequest.Builder> diagnosticHeaders) {
    this(http, retryDelayMillis, diagnosticHeaders, (UploadPacer) null);
  }

  ChunkedUploader(
      HttpClient http,
      long retryDelayMillis,
      UnaryOperator<HttpRequest.Builder> diagnosticHeaders,
      UploadPacer pacer) {
    this(http, retryDelayMillis, diagnosticHeaders, pacer, request -> {});
  }

  ChunkedUploader(
      HttpClient http,
      long retryDelayMillis,
      UnaryOperator<HttpRequest.Builder> diagnosticHeaders,
      BeforeRequest beforeRequest) {
    this(http, retryDelayMillis, diagnosticHeaders, null, beforeRequest);
  }

  private ChunkedUploader(
      HttpClient http,
      long retryDelayMillis,
      UnaryOperator<HttpRequest.Builder> diagnosticHeaders,
      UploadPacer pacer,
      BeforeRequest beforeRequest) {
    this.beforeRequest = beforeRequest;
    this.pacer = pacer;
    this.http = http;
    this.retryDelayMillis = retryDelayMillis;
    this.diagnosticHeaders = diagnosticHeaders;
  }

  void upload(String apiUrl, String token, Path file, JsonObject metadata, LongConsumer progress)
      throws IOException, InterruptedException {
    long size = Files.size(file);
    if (size < 20 || size > MAX_BYTES) {
      throw new IOException("The GLB must be between 20 bytes and 450 MiB.");
    }
    String checksum = checksum(file);
    String identity = hash((apiUrl + "\n" + token).getBytes(StandardCharsets.UTF_8));
    Path statePath = file.resolveSibling(file.getFileName() + ".upload.properties");
    String id = loadState(statePath, checksum, identity);
    saveState(statePath, id, checksum, identity);
    JsonObject payload = new JsonObject();
    payload.addProperty("id", id);
    payload.addProperty("size", size);
    payload.addProperty("sha256", checksum);
    payload.add("metadata", metadata);
    String base = apiUrl + "/api/mod/uploads";
    JsonObject session;
    try {
      session = initialize(base, token, payload);
    } catch (UploadException error) {
      if (error.status != 404) throw error;
      // Expired sessions cannot be reused. Persist the replacement before the request.
      id = UUID.randomUUID().toString();
      saveState(statePath, id, checksum, identity);
      payload.addProperty("id", id);
      session = initialize(base, token, payload);
    }
    long offset = session.get("offset").getAsLong();
    if (session.get("chunkSize").getAsInt() != CHUNK_BYTES
        || offset < 0
        || offset > size
        || (offset != size && offset % CHUNK_BYTES != 0)) {
      throw new IOException("API returned an invalid upload offset or chunk size.");
    }
    progress.accept(offset);
    if (!session.get("completed").getAsBoolean()) {
      sendChunks(base + "/" + id, token, file, size, offset, progress);
      request(
          HttpRequest.newBuilder(URI.create(base + "/" + id + "/complete"))
              .timeout(Duration.ofMinutes(5))
              .header("Authorization", "Bearer " + token)
              .POST(HttpRequest.BodyPublishers.noBody())
              .build());
    }
    Files.deleteIfExists(statePath);
  }

  private JsonObject initialize(String base, String token, JsonObject payload)
      throws IOException, InterruptedException {
    return request(
        HttpRequest.newBuilder(URI.create(base))
            .timeout(Duration.ofSeconds(30))
            .header("Authorization", "Bearer " + token)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(payload.toString()))
            .build());
  }

  private void sendChunks(
      String url, String token, Path file, long size, long initialOffset, LongConsumer progress)
      throws IOException, InterruptedException {
    try (FileChannel channel = FileChannel.open(file, StandardOpenOption.READ)) {
      long offset = initialOffset;
      while (offset < size) {
        byte[] bytes = new byte[(int) Math.min(CHUNK_BYTES, size - offset)];
        ByteBuffer buffer = ByteBuffer.wrap(bytes);
        channel.position(offset);
        while (buffer.hasRemaining()) {
          if (channel.read(buffer) < 0) throw new IOException("The capture changed during upload.");
        }
        JsonObject response =
            request(
                HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(60))
                    .header("Authorization", "Bearer " + token)
                    .header("Content-Type", "application/octet-stream")
                    .header("Upload-Offset", Long.toString(offset))
                    .PUT(
                        pacer == null
                            ? HttpRequest.BodyPublishers.ofByteArray(bytes)
                            : pacer.body(bytes))
                    .build());
        long acknowledged = response.get("offset").getAsLong();
        if (acknowledged != offset + bytes.length)
          throw new IOException("API acknowledged an unexpected upload offset.");
        offset = acknowledged;
        progress.accept(offset);
      }
    }
  }

  /** The last exchange with the API (kind, attempts, status, error code) for diagnostics. */
  DiagnosticReport.Http lastHttp() {
    return lastHttp;
  }

  private static String requestKind(HttpRequest request) {
    if (request.method().equals("PUT")) return "chunk";
    return request.uri().getPath().endsWith("/complete") ? "complete" : "initialize";
  }

  /** The API's {@code error} code, only when it is a plain lowercase identifier. */
  private static long seconds(String value) {
    try {
      return Long.parseLong(value.trim());
    } catch (NumberFormatException ignored) {
      return -1;
    }
  }

  private static String errorCode(String body) {
    try {
      var error = JsonParser.parseString(body).getAsJsonObject().get("error");
      return error != null && error.isJsonPrimitive() && error.getAsJsonPrimitive().isString()
          ? error.getAsString()
          : null;
    } catch (RuntimeException ignored) {
      return null;
    }
  }

  private JsonObject request(HttpRequest request) throws IOException, InterruptedException {
    String kind = requestKind(request);
    for (int attempt = 0; attempt < 3; attempt++) {
      lastHttp = new DiagnosticReport.Http(kind, attempt + 1, 0, null, -1);
      try {
        beforeRequest.check(request);
        if (pacer != null) pacer.check();
        HttpRequest current =
            diagnosticHeaders
                .apply(
                    HttpRequest.newBuilder(
                        request,
                        (name, value) ->
                            !name.toLowerCase(java.util.Locale.ROOT).startsWith("x-minemories-")))
                .build();
        HttpResponse<String> response = http.send(current, ApiResponseBody.bounded());
        int status = response.statusCode();
        lastHttp =
            new DiagnosticReport.Http(
                kind,
                attempt + 1,
                status,
                status >= 400 ? errorCode(response.body()) : null,
                response
                    .headers()
                    .firstValue("Retry-After")
                    .map(ChunkedUploader::seconds)
                    .orElse(-1L));
        if (status >= 200 && status < 300) {
          try {
            return JsonParser.parseString(response.body()).getAsJsonObject();
          } catch (RuntimeException error) {
            throw new IOException("Invalid upload API response", error);
          }
        }
        UploadException error =
            new UploadException(
                status, response.body(), response.headers().firstValue("Retry-After").orElse(null));
        // A 429 is the API asking us to wait: retrying here would only hammer it.
        boolean transientFailure =
            status == 408
                || status >= 500
                || (status == 409 && response.body().contains("upload_busy"));
        if (!transientFailure || attempt == 2) throw error;
      } catch (UploadException error) {
        throw error;
      } catch (IOException error) {
        if (attempt == 2) throw error;
      }
      Thread.sleep(retryDelayMillis * (attempt + 1));
    }
    throw new IOException("Upload retries exhausted.");
  }

  private static String loadState(Path path, String checksum, String identity) throws IOException {
    Properties state = new Properties();
    if (Files.isRegularFile(path)) {
      try (var reader = Files.newBufferedReader(path)) {
        state.load(reader);
      }
      if (checksum.equals(state.getProperty("checksum"))
          && identity.equals(state.getProperty("identity"))) {
        try {
          return UUID.fromString(state.getProperty("id", "")).toString();
        } catch (IllegalArgumentException ignored) {
          /* Recreate an invalid local session identifier. */
        }
      }
    }
    return UUID.randomUUID().toString();
  }

  private static void saveState(Path path, String id, String checksum, String identity)
      throws IOException {
    Properties state = new Properties();
    state.setProperty("id", id);
    state.setProperty("checksum", checksum);
    state.setProperty("identity", identity);
    Path temporary = path.resolveSibling(path.getFileName() + ".tmp");
    try (var writer = Files.newBufferedWriter(temporary)) {
      state.store(writer, "Resumable upload (no device token)");
    }
    Files.move(temporary, path, StandardCopyOption.REPLACE_EXISTING);
  }

  private String checksum(Path path) throws IOException {
    MessageDigest digest = digest();
    try (InputStream input = Files.newInputStream(path)) {
      byte[] bytes = new byte[64 * 1024];
      int read;
      while ((read = input.read(bytes)) != -1) {
        if (pacer != null) pacer.check();
        digest.update(bytes, 0, read);
      }
    }
    return HexFormat.of().formatHex(digest.digest());
  }

  private static String hash(byte[] bytes) {
    return HexFormat.of().formatHex(digest().digest(bytes));
  }

  private static MessageDigest digest() {
    try {
      return MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException("SHA-256 unavailable", error);
    }
  }

  private static final class UploadException extends IOException {
    private static final long serialVersionUID = 1L;
    private final int status;
    private final long retryAfterSeconds;

    UploadException(int status, String body, String retryAfter) {
      super(message(status, body));
      this.status = status;
      this.retryAfterSeconds = status == 429 ? UploadFailure.parseRetryAfter(retryAfter) : -1;
    }

    private static String message(int status, String body) {
      if (status == 413) {
        try {
          var error = JsonParser.parseString(body).getAsJsonObject().get("error");
          if (error != null
              && error.isJsonPrimitive()
              && error.getAsJsonPrimitive().isString()
              && error.getAsString().equals("storage_quota_exceeded")) {
            return StorageQuota.NO_SPACE_MESSAGE;
          }
        } catch (RuntimeException ignored) {
          // An unknown response keeps the generic HTTP message.
        }
      }
      return "Upload refused (HTTP " + status + "). Retry /minemories upload to resume.";
    }
  }

  /** Classifies an upload error; anything that is not an API refusal is {@code OTHER}. */
  static UploadFailure classify(Throwable error) {
    Throwable cause = error;
    while (cause instanceof java.util.concurrent.CompletionException && cause.getCause() != null) {
      cause = cause.getCause();
    }
    if (!(cause instanceof UploadException failure)) {
      return new UploadFailure(UploadFailure.Kind.OTHER, -1, String.valueOf(cause.getMessage()));
    }
    UploadFailure.Kind kind =
        switch (failure.status) {
          case 429 -> UploadFailure.Kind.RATE_LIMITED;
          case 401, 403 -> UploadFailure.Kind.UNAUTHORIZED;
          default ->
              StorageQuota.NO_SPACE_MESSAGE.equals(failure.getMessage())
                  ? UploadFailure.Kind.QUOTA
                  : UploadFailure.Kind.OTHER;
        };
    return new UploadFailure(kind, failure.retryAfterSeconds, failure.getMessage());
  }

  static boolean isAuthorizationFailure(IOException error) {
    return error instanceof UploadException failure
        && (failure.status == 401 || failure.status == 403);
  }
}
