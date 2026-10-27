package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class DiagnosticsClientTest {
  @TempDir Path temporary;
  private HttpServer server;
  private final java.util.concurrent.ExecutorService executor = Executors.newFixedThreadPool(4);
  private final AtomicReference<Properties> settings = new AtomicReference<>(new Properties());
  private final List<JsonObject> bodies = new CopyOnWriteArrayList<>();
  private final List<String> tokens = new CopyOnWriteArrayList<>();
  private final AtomicInteger authorizations = new AtomicInteger();
  private final AtomicInteger deletions = new AtomicInteger();
  private final AtomicInteger reports = new AtomicInteger();
  private volatile int reportStatus = 201;
  private volatile int authorizationStatus = 200;
  private volatile String retryAfter;
  private volatile CountDownLatch authorizationRelease;
  private volatile CountDownLatch reportRelease;
  private String api;

  @AfterEach
  void close() {
    if (authorizationRelease != null) authorizationRelease.countDown();
    if (reportRelease != null) reportRelease.countDown();
    if (server != null) server.stop(0);
    executor.shutdownNow();
  }

  private DiagnosticsClient start() throws IOException {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    server.setExecutor(executor);
    server.createContext("/api/mod/diagnostics", this::respond);
    server.start();
    api = "http://127.0.0.1:" + server.getAddress().getPort();
    return new DiagnosticsClient(
        HttpClient.newHttpClient(),
        settings::get,
        () -> new DiagnosticReport.Versions("0.1.0", "1.21.1", "neoforge-21.1.248"));
  }

  private void respond(HttpExchange request) throws IOException {
    if (request.getRequestMethod().equals("DELETE")) {
      deletions.incrementAndGet();
      send(request, 200, "{\"deleted\":true}");
      return;
    }
    if (request.getRequestURI().getPath().endsWith("/consent")) {
      authorizations.incrementAndGet();
      waitFor(authorizationRelease);
      send(request, authorizationStatus, "{\"permit\":\"" + UUID.randomUUID() + "\"}");
      return;
    }
    tokens.add(request.getRequestHeaders().getFirst("Authorization"));
    assertNotNull(request.getRequestHeaders().getFirst("X-Minemories-Diagnostics-Permit"));
    bodies.add(
        JsonParser.parseString(
                new String(request.getRequestBody().readAllBytes(), StandardCharsets.UTF_8))
            .getAsJsonObject());
    reports.incrementAndGet();
    waitFor(reportRelease);
    if (retryAfter != null) request.getResponseHeaders().add("Retry-After", retryAfter);
    send(request, reportStatus, "{}");
  }

  private static void waitFor(CountDownLatch latch) {
    if (latch == null) return;
    try {
      if (!latch.await(5, TimeUnit.SECONDS))
        throw new AssertionError("Test request was not released");
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
    }
  }

  private static void send(HttpExchange exchange, int status, String response) throws IOException {
    byte[] bytes = response.getBytes(StandardCharsets.UTF_8);
    try {
      exchange.sendResponseHeaders(status, bytes.length);
      exchange.getResponseBody().write(bytes);
    } catch (IOException ignored) {
      // Cancellation intentionally closes the socket in the late-response scenarios.
    } finally {
      exchange.close();
    }
  }

  private Properties paired(boolean consent, String token) {
    Properties result = new Properties();
    result.setProperty("apiUrl", api);
    result.setProperty("deviceToken", token);
    result.setProperty("deviceId", UUID.randomUUID().toString());
    result.setProperty("diagnosticsConsent", Boolean.toString(consent));
    if (consent)
      result.setProperty("diagnosticsIdentity", ClientSettings.diagnosticsBinding(result, null));
    return result;
  }

  private void enable(DiagnosticsClient client) throws Exception {
    settings.set(paired(true, "private-test-token"));
    await(() -> client.status().startsWith("Activés"));
  }

  private static void await(BooleanSupplier condition) throws Exception {
    long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
    while (!condition.getAsBoolean()) {
      if (System.nanoTime() > end) fail("Timed out waiting for the bounded local HTTP fixture");
      Thread.sleep(10);
    }
  }

  private static final class PrivateError extends RuntimeException {
    private static final long serialVersionUID = 1L;
    private int stackReads;

    @Override
    public String getMessage() {
      throw new AssertionError("Never collect an exception message");
    }

    @Override
    public StackTraceElement[] getStackTrace() {
      stackReads++;
      return new StackTraceElement[] {
        new StackTraceElement(
            "dev.minemories.client.Minemories", "export", "ClientRuntime.java", 600)
      };
    }
  }

  @Test
  void defaultOffAndUnpairedConsentNeverCollectOrMakeRequests() throws Exception {
    DiagnosticsClient client = start();
    for (Properties configuration : List.of(paired(false, "private"), new Properties())) {
      configuration.setProperty("diagnosticsConsent", configuration.isEmpty() ? "true" : "false");
      settings.set(configuration);
      PrivateError error = new PrivateError();
      var operation = client.begin(DiagnosticReport.Phase.CAPTURE, null);
      operation.step(DiagnosticReport.Step.CAPTURE_STARTED);
      operation.failed(error);
      assertEquals(0, error.stackReads);
      assertTrue(client.status().startsWith("Désactivés"));
      assertTrue(
          operation
              .headers(HttpRequest.newBuilder(URI.create(api)))
              .GET()
              .build()
              .headers()
              .map()
              .isEmpty());
    }
    assertEquals(0, authorizations.get());
    assertEquals(0, reports.get());
  }

  @Test
  void anAbsentConsentKeyMeansOnOnceButOnlyAfterPairing() throws Exception {
    DiagnosticsClient client = start();
    Properties unpaired = new Properties();
    unpaired.setProperty("apiUrl", api);
    settings.set(unpaired);
    var early = client.begin(DiagnosticReport.Phase.CAPTURE, null);
    early.failed(new PrivateError());
    Thread.sleep(150);
    assertEquals(0, authorizations.get());
    assertEquals(0, reports.get());

    Properties implicit = paired(true, "private-test-token");
    implicit.remove("diagnosticsConsent");
    implicit.remove("diagnosticsIdentity");
    settings.set(implicit);
    await(() -> client.status().startsWith("Activés"));
    var operation = client.begin(DiagnosticReport.Phase.CAPTURE, null);
    operation.step(DiagnosticReport.Step.CAPTURE_STARTED);
    operation.failed(new PrivateError());
    await(() -> reports.get() == 1 && !client.isSending());
    assertEquals(1, authorizations.get());
  }

  @Test
  void anExplicitRefusalStaysRefusedAfterTheDeviceTokenChanges() throws Exception {
    DiagnosticsClient client = start();
    Properties refused = paired(false, "first-token");
    settings.set(refused);
    Thread.sleep(150);
    Properties repaired = paired(false, "second-token");
    ClientSettings.forgetBoundDiagnostics(repaired);
    settings.set(repaired);
    var operation = client.begin(DiagnosticReport.Phase.CAPTURE, null);
    PrivateError error = new PrivateError();
    operation.failed(error);
    Thread.sleep(150);
    assertEquals("false", repaired.getProperty("diagnosticsConsent"));
    assertEquals(0, error.stackReads);
    assertEquals(0, authorizations.get());
    assertEquals(0, reports.get());
  }

  @Test
  void captureAndUploadShareCorrelationAndOnlySanitizedBoundedData() throws Exception {
    DiagnosticsClient client = start();
    enable(client);
    Path file = temporary.resolve("private/world-name/capture.glb");
    var capture = client.begin(DiagnosticReport.Phase.CAPTURE, null);
    HttpRequest captureHeaders =
        capture.headers(HttpRequest.newBuilder(URI.create(api))).GET().build();
    capture.captured(file);
    var upload = client.begin(DiagnosticReport.Phase.UPLOAD, file);
    HttpRequest uploadHeaders =
        upload.headers(HttpRequest.newBuilder(URI.create(api))).GET().build();
    assertEquals(
        captureHeaders.headers().firstValue("X-Minemories-Correlation"),
        uploadHeaders.headers().firstValue("X-Minemories-Correlation"));
    PrivateError error = new PrivateError();
    upload.failed(error);
    await(() -> reports.get() == 1 && !client.isSending());
    assertEquals(1, error.stackReads);
    String body = bodies.getFirst().toString();
    assertFalse(body.contains("private-test-token"));
    assertFalse(body.contains("world-name"));
    assertFalse(body.contains(api));
    var report = bodies.getFirst().getAsJsonObject("report");
    assertEquals(
        uploadHeaders.headers().firstValue("X-Minemories-Correlation").orElseThrow(),
        report.get("correlationId").getAsString());
    assertEquals(4, report.getAsJsonArray("breadcrumbs").size());
    assertEquals("upload", report.get("phase").getAsString());
  }

  @Test
  void disablingDuringAuthorizationCannotReenableOrCollectFromLateReply() throws Exception {
    DiagnosticsClient client = start();
    authorizationRelease = new CountDownLatch(1);
    settings.set(paired(true, "private"));
    assertTrue(client.status().startsWith("Vérification"));
    await(() -> authorizations.get() == 1);
    client.settingsChanged(() -> settings.get().setProperty("diagnosticsConsent", "false"));
    authorizationRelease.countDown();
    await(() -> deletions.get() == 1);
    PrivateError error = new PrivateError();
    client.begin(DiagnosticReport.Phase.UPLOAD, null).failed(error);
    assertTrue(client.status().startsWith("Désactivés"));
    assertEquals(0, error.stackReads);
    assertEquals(0, reports.get());
  }

  @Test
  void changedIdentityDropsOldOperationAndCaptureCacheBeforeReporting() throws Exception {
    DiagnosticsClient client = start();
    enable(client);
    Path file = temporary.resolve("private/capture.glb");
    var capture = client.begin(DiagnosticReport.Phase.CAPTURE, null);
    String oldId =
        capture
            .headers(HttpRequest.newBuilder(URI.create(api)))
            .GET()
            .build()
            .headers()
            .firstValue("X-Minemories-Correlation")
            .orElseThrow();
    capture.captured(file);
    var old = client.begin(DiagnosticReport.Phase.UPLOAD, file);
    settings.set(paired(true, "other-test-token"));
    PrivateError ignored = new PrivateError();
    old.failed(ignored);
    assertEquals(0, ignored.stackReads);
    await(() -> client.status().startsWith("Activés"));
    client.begin(DiagnosticReport.Phase.UPLOAD, file).failed(new PrivateError());
    await(() -> reports.get() == 1 && !client.isSending());
    assertEquals("Bearer other-test-token", tokens.getFirst());
    assertNotEquals(
        oldId, bodies.getFirst().getAsJsonObject("report").get("correlationId").getAsString());
    assertEquals(
        2, bodies.getFirst().getAsJsonObject("report").getAsJsonArray("breadcrumbs").size());
    await(() -> deletions.get() == 1);
  }

  @Test
  void disableCancelsInFlightReportAndDiscardsLateResponse() throws Exception {
    DiagnosticsClient client = start();
    enable(client);
    reportRelease = new CountDownLatch(1);
    client.begin(DiagnosticReport.Phase.UPLOAD, null).failed(new PrivateError());
    await(() -> reports.get() == 1);
    client.settingsChanged(() -> settings.get().setProperty("diagnosticsConsent", "false"));
    await(() -> deletions.get() == 1);
    reportRelease.countDown();
    PrivateError ignored = new PrivateError();
    client.begin(DiagnosticReport.Phase.UPLOAD, null).failed(ignored);
    assertEquals(0, ignored.stackReads);
    assertFalse(client.isSending());
    assertTrue(client.status().startsWith("Désactivés"));
    assertEquals(1, reports.get());
  }

  @Test
  void revokedDeviceStopsFurtherCollectionAndAuthorizationRetries() throws Exception {
    DiagnosticsClient client = start();
    enable(client);
    reportStatus = 401;
    client.begin(DiagnosticReport.Phase.UPLOAD, null).failed(new PrivateError());
    await(() -> reports.get() == 1 && !client.isSending());
    PrivateError ignored = new PrivateError();
    client.begin(DiagnosticReport.Phase.CAPTURE, null).failed(ignored);
    assertEquals(0, ignored.stackReads);
    assertTrue(client.status().contains("refusé"));
    assertEquals(1, authorizations.get());
    assertEquals(1, reports.get());
  }

  @Test
  void reportQuotaAndOperationLimitAvoidUnboundedQueuesOrCollections() throws Exception {
    DiagnosticsClient client = start();
    enable(client);
    var discarded = client.begin(DiagnosticReport.Phase.UPLOAD, null);
    for (int index = 0; index < 8; index++) client.begin(DiagnosticReport.Phase.CAPTURE, null);
    PrivateError ignored = new PrivateError();
    discarded.failed(ignored);
    assertEquals(0, ignored.stackReads);
    for (int index = 0; index < 7; index++) {
      client.begin(DiagnosticReport.Phase.UPLOAD, null).failed(new PrivateError());
      int expected = Math.min(index + 1, 5);
      await(() -> reports.get() == expected && !client.isSending());
    }
    assertEquals(5, reports.get());
  }

  @Test
  void chunkRetriesRereadConsentAndNeverReuseEarlierOptInHeaders() throws Exception {
    DiagnosticsClient client = start();
    enable(client);
    AtomicInteger chunks = new AtomicInteger();
    List<Boolean> consentHeaders = new CopyOnWriteArrayList<>();
    List<String> correlations = new CopyOnWriteArrayList<>();
    server.createContext(
        "/api/mod/uploads",
        request -> {
          consentHeaders.add(
              "true"
                  .equals(
                      request.getRequestHeaders().getFirst("X-Minemories-Diagnostics-Consent")));
          String correlation = request.getRequestHeaders().getFirst("X-Minemories-Correlation");
          if (correlation != null) correlations.add(correlation);
          if (request.getRequestMethod().equals("PUT") && chunks.getAndIncrement() == 0) {
            settings.get().setProperty("diagnosticsConsent", "false");
            send(request, 503, "{}");
          } else if (request.getRequestMethod().equals("PUT")) {
            send(request, 200, "{\"offset\":32}");
          } else if (request.getRequestURI().getPath().endsWith("/complete")) {
            send(request, 201, "{}");
          } else {
            send(request, 201, "{\"offset\":0,\"chunkSize\":4194304,\"completed\":false}");
          }
        });
    Path file = temporary.resolve("capture.glb");
    Files.write(file, new byte[32]);
    var operation = client.begin(DiagnosticReport.Phase.UPLOAD, file);
    new ChunkedUploader(HttpClient.newHttpClient(), 0, operation::headers)
        .upload(api, "private-test-token", file, new JsonObject(), offset -> {});
    operation.success();
    assertEquals(List.of(true, true, false, false), consentHeaders);
    assertEquals(2, correlations.size());
    assertEquals(correlations.getFirst(), correlations.get(1));
    await(() -> deletions.get() == 1);
    assertEquals(0, reports.get());
  }

  @Test
  void withdrawalStopsCollectionEvenWhenSavingThePreferenceFails() throws Exception {
    DiagnosticsClient client = start();
    enable(client);
    var previous = client.begin(DiagnosticReport.Phase.CAPTURE, null);
    assertThrows(
        IllegalStateException.class,
        () ->
            client.changeConsent(
                false,
                () -> {
                  throw new IllegalStateException("write failed");
                }));
    assertTrue(ClientSettings.diagnosticsConsent(settings.get()));
    assertFalse(client.consentAllowed());
    PrivateError ignored = new PrivateError();
    previous.failed(ignored);
    client.settingsChanged(() -> {});
    client.begin(DiagnosticReport.Phase.UPLOAD, null).failed(ignored);
    assertEquals(0, ignored.stackReads);
    assertTrue(client.status().startsWith("Désactivés"));
    await(() -> deletions.get() == 1);
    assertEquals(0, reports.get());
    client.changeConsent(true, () -> {});
    await(() -> client.status().startsWith("Activés"));
    assertTrue(client.consentAllowed());
  }

  @Test
  void aStoredTrueCannotTransferConsentToAnotherTokenOrDevice() throws Exception {
    DiagnosticsClient client = start();
    enable(client);
    var previous = client.begin(DiagnosticReport.Phase.UPLOAD, null);
    settings.get().setProperty("deviceToken", "replacement-private-token");
    PrivateError error = new PrivateError();
    previous.failed(error);
    client.begin(DiagnosticReport.Phase.UPLOAD, null).failed(error);
    assertTrue(client.status().startsWith("Désactivés"));
    assertEquals(0, error.stackReads);
    assertEquals(1, authorizations.get());
    await(() -> deletions.get() == 1);
    assertEquals(0, reports.get());
    client.changeConsent(
        true,
        () ->
            settings
                .get()
                .setProperty(
                    "diagnosticsIdentity",
                    ClientSettings.diagnosticsBinding(settings.get(), null)));
    await(() -> client.status().startsWith("Activés"));
    client.begin(DiagnosticReport.Phase.UPLOAD, null).failed(new PrivateError());
    await(() -> reports.get() == 1 && !client.isSending());
    assertEquals("Bearer replacement-private-token", tokens.getFirst());
  }

  private DiagnosticsClient durable(java.util.concurrent.atomic.AtomicLong clock) {
    return new DiagnosticsClient(
        HttpClient.newHttpClient(),
        settings::get,
        () -> new DiagnosticReport.Versions("0.2.1-beta.1", "1.21.1", "neoforge-21.1.248"),
        temporary.resolve("diagnostics.properties"),
        clock::get);
  }

  @Test
  void retriesTheSameReportAfterNetworkFailureAndRestart() throws Exception {
    start();
    var clock = new java.util.concurrent.atomic.AtomicLong(System.currentTimeMillis());
    var client = durable(clock);
    enable(client);
    reportStatus = 503;
    client.begin(DiagnosticReport.Phase.CAPTURE, null).failed(new IOException("private-path"));
    await(() -> reports.get() == 1 && !client.isSending());
    String id = bodies.getFirst().getAsJsonObject("report").get("id").getAsString();
    var restarted = durable(clock);
    reportStatus = 201;
    await(() -> restarted.status().startsWith("Activés"));
    assertEquals(1, reports.get());
    clock.addAndGet(30001);
    restarted.tick();
    await(() -> reports.get() == 2 && !restarted.isSending());
    assertEquals(id, bodies.getLast().getAsJsonObject("report").get("id").getAsString());
    assertFalse(
        Files.readString(temporary.resolve("diagnostics.properties"))
            .contains("private-test-token"));
  }

  @Test
  void crashIsDurableBeforeExitAndSentByTheNextClientLaunch() throws Exception {
    start();
    var clock = new java.util.concurrent.atomic.AtomicLong(System.currentTimeMillis());
    var client = durable(clock);
    enable(client);
    client.crash(new IllegalStateException("private-world /home/player token"));
    assertEquals(0, reports.get());
    assertTrue(Files.exists(temporary.resolve("diagnostics.properties")));
    var restarted = durable(clock);
    await(
        () -> {
          restarted.tick();
          return reports.get() == 1 && !restarted.isSending();
        });
    JsonObject report = bodies.getFirst().getAsJsonObject("report");
    assertEquals("crash", report.get("phase").getAsString());
    assertEquals(
        "client_crashed",
        report.getAsJsonArray("breadcrumbs").get(0).getAsJsonObject().get("step").getAsString());
    assertFalse(report.toString().contains("private-world"));
  }

  @Test
  void offlineStartupCanRecordAnOptedInCrashButAWithdrawnSpoolIsNeverSent() throws Exception {
    start();
    var clock = new java.util.concurrent.atomic.AtomicLong(System.currentTimeMillis());
    var first = durable(clock);
    enable(first);
    var restarted = durable(clock);
    authorizationRelease = new CountDownLatch(1);
    restarted.crash(new IllegalStateException("private-world"));
    assertTrue(
        Files.readString(temporary.resolve("diagnostics.properties")).contains("client_crashed"));
    restarted.changeConsent(false, () -> settings.get().setProperty("diagnosticsConsent", "false"));
    assertFalse(Files.exists(temporary.resolve("diagnostics.properties")));
    authorizationRelease.countDown();
    await(() -> deletions.get() == 1);
    restarted.tick();
    assertEquals(0, reports.get());
  }

  @Test
  void reportedRootCauseIsUsefulWithoutReadingMessages() {
    var inner = new IOException("private-path");
    var payload =
        DiagnosticReport.create(
                DiagnosticReport.Phase.CAPTURE,
                new DiagnosticReport.Versions("0.2.1-beta.1", "1.21.1", "neoforge-21.1.248"),
                UUID.randomUUID(),
                new java.util.concurrent.CompletionException(inner),
                List.of())
            .payload();
    assertEquals(
        "java.io.IOException",
        payload.getAsJsonObject("report").getAsJsonObject("exception").get("type").getAsString());
    assertFalse(payload.toString().contains("private-path"));
  }

  @Test
  void serverRetryAfterIsRespectedWithoutDroppingSubsequentFailures() throws Exception {
    start();
    var clock = new java.util.concurrent.atomic.AtomicLong(System.currentTimeMillis());
    var client = durable(clock);
    enable(client);
    reportStatus = 429;
    retryAfter = "120";
    client.begin(DiagnosticReport.Phase.CAPTURE, null).failed(new IOException("first"));
    await(() -> reports.get() == 1 && !client.isSending());
    client.begin(DiagnosticReport.Phase.UPLOAD, null).failed(new IOException("second"));
    clock.addAndGet(30001);
    client.tick();
    assertEquals(1, reports.get());
    reportStatus = 201;
    clock.addAndGet(90000);
    client.tick();
    await(() -> reports.get() == 3 && !client.isSending());
    assertEquals(
        bodies.getFirst().getAsJsonObject("report").get("id"),
        bodies.get(1).getAsJsonObject("report").get("id"));
    assertNotEquals(
        bodies.get(1).getAsJsonObject("report").get("id"),
        bodies.getLast().getAsJsonObject("report").get("id"));
  }

  @Test
  void unavailableFirstAuthorizationNeverCollectsButCanRecoverOnHeartbeat() throws Exception {
    start();
    var clock = new java.util.concurrent.atomic.AtomicLong(System.currentTimeMillis());
    var client = durable(clock);
    settings.set(paired(true, "private-test-token"));
    authorizationStatus = 503;
    client.tick();
    await(() -> authorizations.get() == 1 && client.status().contains("indisponible"));
    PrivateError ignored = new PrivateError();
    client.begin(DiagnosticReport.Phase.CAPTURE, null).failed(ignored);
    assertEquals(0, ignored.stackReads);
    assertFalse(Files.exists(temporary.resolve("diagnostics.properties")));
    authorizationStatus = 200;
    clock.addAndGet(30001);
    client.tick();
    await(() -> client.status().startsWith("Activés"));
    client.begin(DiagnosticReport.Phase.CAPTURE, null).failed(new IOException("private"));
    await(() -> reports.get() == 1 && !client.isSending());
  }

  @Test
  void newConsentEpochCannotRestoreAPreviousConsentQueue() throws Exception {
    start();
    var clock = new java.util.concurrent.atomic.AtomicLong(System.currentTimeMillis());
    var client = durable(clock);
    enable(client);
    client.crash(new IllegalStateException("private"));
    byte[] old = Files.readAllBytes(temporary.resolve("diagnostics.properties"));
    client.changeConsent(false, () -> settings.get().setProperty("diagnosticsConsent", "false"));
    Files.write(temporary.resolve("diagnostics.properties"), old);
    var next = durable(clock);
    settings.get().setProperty("diagnosticsEpoch", UUID.randomUUID().toString());
    settings.get().setProperty("diagnosticsConsent", "true");
    await(() -> next.status().startsWith("Activés"));
    next.tick();
    assertEquals(0, reports.get());
  }

  @Test
  void crashIsRetriedWhenTheApiStillUsesThePreviousContract() throws Exception {
    start();
    var clock = new java.util.concurrent.atomic.AtomicLong(System.currentTimeMillis());
    var client = durable(clock);
    enable(client);
    client.crash(new IllegalStateException("private"));
    reportStatus = 400;
    client.tick();
    await(() -> reports.get() == 1 && !client.isSending());
    clock.addAndGet(30001);
    client.tick();
    assertEquals(1, reports.get());
    reportStatus = 201;
    clock.addAndGet(300000);
    client.tick();
    await(() -> reports.get() == 2 && !client.isSending());
    assertEquals(
        bodies.getFirst().getAsJsonObject("report").get("id"),
        bodies.getLast().getAsJsonObject("report").get("id"));
  }
}
