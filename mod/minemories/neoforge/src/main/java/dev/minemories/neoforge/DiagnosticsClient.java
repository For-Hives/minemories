package dev.minemories.neoforge;

import com.google.gson.JsonParser;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.function.LongSupplier;
import java.util.function.Supplier;

/** Consent governs a bounded durable outbox; all network work remains asynchronous. */
final class DiagnosticsClient {
  private static final int MAX_OPERATIONS = 8;
  private final DiagnosticOutbox outbox;
  private final LongSupplier clock;
  private long authorizationRetryAt;
  private final HttpClient http;
  private final Supplier<Properties> settings;
  private final Supplier<DiagnosticReport.Versions> versions;
  private final ArrayDeque<Operation> operations = new ArrayDeque<>();
  private Identity identity;
  private String permit;
  private long generation;
  private CachedCapture capture;
  private CompletableFuture<HttpResponse<String>> authorization;
  private CompletableFuture<HttpResponse<String>> submission;
  private CompletableFuture<HttpResponse<String>> deletion;
  private boolean refused;
  private boolean withdrawn;

  DiagnosticsClient(
      HttpClient http,
      Supplier<Properties> settings,
      Supplier<DiagnosticReport.Versions> versions) {
    this(http, settings, versions, null, System::currentTimeMillis);
  }

  DiagnosticsClient(
      HttpClient http,
      Supplier<Properties> settings,
      Supplier<DiagnosticReport.Versions> versions,
      Path queue) {
    this(http, settings, versions, queue, System::currentTimeMillis);
  }

  DiagnosticsClient(
      HttpClient http,
      Supplier<Properties> settings,
      Supplier<DiagnosticReport.Versions> versions,
      Path queue,
      LongSupplier clock) {
    this.http = http;
    this.settings = settings;
    this.versions = versions;
    this.outbox = new DiagnosticOutbox(queue);
    this.clock = clock;
  }

  private record Identity(String api, String token, String device, String binding) {}

  private record CachedCapture(
      Path path, UUID correlation, long started, List<DiagnosticReport.Breadcrumb> breadcrumbs) {}

  static final class Operation {
    private final DiagnosticsClient owner;
    private final DiagnosticReport.Phase phase;
    private final UUID correlation;
    private final long generation;
    private final long started;
    private final ArrayDeque<DiagnosticReport.Breadcrumb> breadcrumbs = new ArrayDeque<>();
    private boolean finished;

    private Operation(
        DiagnosticsClient owner,
        DiagnosticReport.Phase phase,
        UUID correlation,
        long generation,
        long started) {
      this.owner = owner;
      this.phase = phase;
      this.correlation = correlation;
      this.generation = generation;
      this.started = started;
    }

    void step(DiagnosticReport.Step step) {
      owner.step(this, step);
    }

    void success() {
      owner.finish(this, null, null);
    }

    void captured(Path file) {
      owner.finish(this, Objects.requireNonNull(file), null);
    }

    void failed(Throwable error) {
      owner.finish(this, null, Objects.requireNonNull(error));
    }

    void revoked() {
      owner.revoke(this);
    }

    HttpRequest.Builder headers(HttpRequest.Builder request) {
      return owner.headers(this, request);
    }
  }

  private Identity configuredIdentity() {
    if (withdrawn) return null;
    try {
      Properties current = settings.get();
      if (!ClientSettings.diagnosticsConsentForIdentity(
          current, System.getenv("MINEMORIES_API_URL"))) return null;
      String token = current.getProperty("deviceToken", "");
      String device = current.getProperty("deviceId", "");
      if (token.isBlank() || !UUID.fromString(device).toString().equals(device)) return null;
      return new Identity(
          ClientSettings.apiUrl(current, System.getenv("MINEMORIES_API_URL")),
          token,
          device,
          current.getProperty("diagnosticsIdentity")
              + ":"
              + current.getProperty("diagnosticsEpoch", "legacy"));
    } catch (RuntimeException ignored) {
      return null;
    }
  }

  private void refresh() {
    Identity configured = configuredIdentity();
    if (!Objects.equals(configured, identity)) {
      Identity previous = identity;
      clear();
      identity = configured;
      refused = false;
      authorizationRetryAt = 0;
      if (previous != null) purge(previous);
    }
    outbox.bind(identity == null ? null : identity.binding, clock.getAsLong());
    if (identity != null
        && permit == null
        && authorization == null
        && !refused
        && clock.getAsLong() >= authorizationRetryAt) authorize();
  }

  private void clear() {
    generation++;
    for (Operation operation : operations) {
      operation.breadcrumbs.clear();
      operation.finished = true;
    }
    operations.clear();
    capture = null;
    permit = null;
    if (authorization != null) authorization.cancel(true);
    if (submission != null) submission.cancel(true);
    authorization = null;
    submission = null;
  }

  private void authorize() {
    Identity requested = identity;
    long requestedGeneration = generation;
    if (deletion != null && !deletion.isDone()) {
      var waiting = deletion.handle((response, error) -> (HttpResponse<String>) null);
      authorization = waiting;
      waiting.whenComplete(
          (response, error) -> {
            synchronized (this) {
              if (requestedGeneration != generation || !requested.equals(configuredIdentity()))
                return;
              authorization = null;
              authorize();
            }
          });
      return;
    }
    HttpRequest request =
        HttpRequest.newBuilder(URI.create(requested.api + "/api/mod/diagnostics/consent"))
            .timeout(Duration.ofSeconds(10))
            .header("Authorization", "Bearer " + requested.token)
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString("{\"enabled\":true}"))
            .build();
    CompletableFuture<HttpResponse<String>> pending;
    try {
      pending = http.sendAsync(request, ApiResponseBody.bounded());
    } catch (RuntimeException ignored) {
      authorizationRetryAt = clock.getAsLong() + 30000;
      return;
    }
    authorization = pending;
    pending.whenComplete(
        (response, error) -> {
          synchronized (this) {
            if (requestedGeneration != generation || !requested.equals(configuredIdentity()))
              return;
            authorization = null;
            authorizationRetryAt = clock.getAsLong() + 30000;
            if (error != null) return;
            if (response.statusCode() == 401 || response.statusCode() == 403) {
              refused = true;
              outbox.purge();
              return;
            }
            if (response.statusCode() != 200) {
              authorizationRetryAt = clock.getAsLong() + retryDelay(response);
              return;
            }
            try {
              String value =
                  JsonParser.parseString(response.body())
                      .getAsJsonObject()
                      .get("permit")
                      .getAsString();
              String canonical = UUID.fromString(value).toString();
              if (!canonical.equals(value)) return;
              permit = canonical;
              refused = false;
              outbox.authorize();
              flush();
            } catch (RuntimeException ignored) {
              // An unsupported or malformed API never enables collection.
            }
          }
        });
  }

  synchronized String status() {
    refresh();
    if (identity == null) return "Désactivés : aucune collecte ni aucun envoi.";
    if (permit != null) return "Activés. Rapports en attente : " + outbox.size() + ".";
    if (!refused && outbox.authorized())
      return "Hors ligne : rapports conservés pour le prochain envoi.";
    return authorization != null
        ? "Vérification du compte et de l’accord…"
        : "API indisponible ou compte refusé : aucune collecte.";
  }

  synchronized boolean isSending() {
    return submission != null;
  }

  synchronized boolean consentAllowed() {
    return !withdrawn;
  }

  /** Withdrawal fails closed in memory even if saving the preference fails. */
  synchronized void changeConsent(boolean enabled, Runnable mutation) {
    if (enabled) {
      mutation.run();
      withdrawn = false;
      refresh();
      return;
    }
    Identity previous = identity != null ? identity : configuredIdentity();
    withdrawn = true;
    clear();
    outbox.bind(null, clock.getAsLong());
    identity = null;
    try {
      mutation.run();
    } finally {
      if (previous != null) purge(previous);
    }
  }

  /** Changes are serialized with request starts; old callbacks cannot revive consent. */
  synchronized void settingsChanged(Runnable mutation) {
    Identity previous = configuredIdentity();
    mutation.run();
    Identity current = configuredIdentity();
    if (!Objects.equals(previous, current)) {
      clear();
      identity = null;
      if (previous != null) purge(previous);
    }
    refresh();
  }

  private void purge(Identity previous) {
    if (deletion != null) deletion.cancel(true);
    // A single best-effort deletion is allowed after opting out; it contains no diagnostic data.
    try {
      deletion =
          http.sendAsync(
              HttpRequest.newBuilder(URI.create(previous.api + "/api/mod/diagnostics"))
                  .timeout(Duration.ofSeconds(10))
                  .header("Authorization", "Bearer " + previous.token)
                  .DELETE()
                  .build(),
              ApiResponseBody.bounded());
    } catch (RuntimeException ignored) {
      deletion = null;
    }
  }

  synchronized Operation begin(DiagnosticReport.Phase phase, Path file) {
    refresh();
    UUID correlation = collectingAllowed() ? UUID.randomUUID() : null;
    long started = System.nanoTime();
    if (correlation != null && capture != null && Objects.equals(file, capture.path)) {
      correlation = capture.correlation;
      started = capture.started;
    }
    Operation operation = new Operation(this, phase, correlation, generation, started);
    if (correlation != null) {
      if (operations.size() == MAX_OPERATIONS) {
        Operation old = operations.removeFirst();
        old.breadcrumbs.clear();
        old.finished = true;
      }
      if (capture != null && capture.correlation.equals(correlation))
        operation.breadcrumbs.addAll(capture.breadcrumbs);
      operations.add(operation);
      step(
          operation,
          phase == DiagnosticReport.Phase.CAPTURE
              ? DiagnosticReport.Step.CAPTURE_STARTED
              : DiagnosticReport.Step.UPLOAD_STARTED);
    }
    return operation;
  }

  private boolean eligible(Operation operation) {
    refresh();
    return !operation.finished
        && operation.correlation != null
        && operation.generation == generation
        && collectingAllowed();
  }

  private boolean collectingAllowed() {
    return identity != null && !refused && (permit != null || outbox.authorized());
  }

  synchronized void tick() {
    refresh();
    outbox.expire(clock.getAsLong());
    flush();
  }

  synchronized void crash(Throwable error) {
    refresh();
    if (!collectingAllowed()) return;
    List<DiagnosticReport.Breadcrumb> steps = new ArrayList<>();
    for (Operation active : operations) steps.addAll(active.breadcrumbs);
    var active = operations.peekLast();
    long elapsed =
        active == null ? 0 : Math.max(0, (System.nanoTime() - active.started) / 1_000_000);
    steps.add(new DiagnosticReport.Breadcrumb(DiagnosticReport.Step.CLIENT_CRASHED, elapsed));
    try {
      var report =
          DiagnosticReport.create(
              DiagnosticReport.Phase.CRASH,
              versions.get(),
              active == null ? UUID.randomUUID() : active.correlation,
              error,
              steps);
      outbox.add(report.payload());
      // The durable write happens before returning to Minecraft's original crash/exit path.
    } catch (RuntimeException ignored) {
      // The original Minecraft crash handler remains authoritative.
    }
  }

  private synchronized void step(Operation operation, DiagnosticReport.Step step) {
    if (!eligible(operation)) return;
    if (operation.breadcrumbs.size() == 8) operation.breadcrumbs.removeFirst();
    long elapsed = Math.max(0, (System.nanoTime() - operation.started) / 1_000_000);
    operation.breadcrumbs.addLast(new DiagnosticReport.Breadcrumb(step, elapsed));
  }

  private synchronized void revoke(Operation operation) {
    if (!eligible(operation)) return;
    clear();
    outbox.purge();
    refused = true;
  }

  private synchronized HttpRequest.Builder headers(
      Operation operation, HttpRequest.Builder request) {
    if (eligible(operation) && permit != null) {
      request.header("X-Minemories-Correlation", operation.correlation.toString());
      request.header("X-Minemories-Diagnostics-Consent", "true");
      request.header("X-Minemories-Diagnostics-Permit", permit);
    }
    return request;
  }

  private synchronized void finish(Operation operation, Path file, Throwable error) {
    if (eligible(operation)) {
      step(
          operation,
          error != null
              ? (operation.phase == DiagnosticReport.Phase.CAPTURE
                  ? DiagnosticReport.Step.CAPTURE_FAILED
                  : DiagnosticReport.Step.UPLOAD_FAILED)
              : (operation.phase == DiagnosticReport.Phase.CAPTURE
                  ? DiagnosticReport.Step.CAPTURE_WRITTEN
                  : DiagnosticReport.Step.UPLOAD_COMPLETED));
      if (file != null)
        capture =
            new CachedCapture(
                file, operation.correlation, operation.started, List.copyOf(operation.breadcrumbs));
      if (error != null) submit(operation, error);
    }
    operations.remove(operation);
    operation.breadcrumbs.clear();
    operation.finished = true;
  }

  private void submit(Operation operation, Throwable error) {
    DiagnosticReport report;
    try {
      report =
          DiagnosticReport.create(
              operation.phase,
              versions.get(),
              operation.correlation,
              error,
              new ArrayList<>(operation.breadcrumbs));
    } catch (RuntimeException ignored) {
      return;
    }
    if (!eligible(operation)) return;
    outbox.add(report.payload());
    flush();
  }

  private void flush() {
    if (permit == null
        || refused
        || submission != null
        || !Objects.equals(identity, configuredIdentity())) return;
    long now = clock.getAsLong();
    var payload = outbox.next(now);
    if (payload == null) return;
    Identity requested = identity;
    long requestedGeneration = generation;
    String id = payload.getAsJsonObject("report").get("id").getAsString();
    var request =
        HttpRequest.newBuilder(URI.create(requested.api + "/api/mod/diagnostics"))
            .timeout(Duration.ofSeconds(10))
            .header("Authorization", "Bearer " + requested.token)
            .header("Content-Type", "application/json")
            .header("X-Minemories-Diagnostics-Permit", permit)
            .POST(HttpRequest.BodyPublishers.ofString(payload.toString()))
            .build();
    outbox.attempted();
    outbox.retry(now, 30000);
    CompletableFuture<HttpResponse<String>> pending;
    try {
      pending = http.sendAsync(request, ApiResponseBody.bounded());
    } catch (RuntimeException ignored) {
      return;
    }
    submission = pending;
    pending.whenComplete(
        (response, failure) -> {
          synchronized (this) {
            if (requestedGeneration != generation || !requested.equals(configuredIdentity()))
              return;
            submission = null;
            if (failure != null) return;
            int status = response.statusCode();
            if (status == 401 || status == 403) {
              clear();
              outbox.purge();
              refused = true;
            } else if (status == 400
                && "crash".equals(payload.getAsJsonObject("report").get("phase").getAsString())) {
              // A rolling deployment may still serve the previous API contract without crash.
              // Retain this sanitized report until the API catches up, within the same bounds.
              outbox.retry(clock.getAsLong(), 300000);
            } else if (status == 200
                || status == 201
                || status == 400
                || status == 409
                || status == 413
                || status == 422) {
              outbox.remove(id);
              outbox.retry(clock.getAsLong(), 0);
              flush();
            } else {
              outbox.retry(clock.getAsLong(), retryDelay(response));
            }
          }
        });
  }

  private static long retryDelay(HttpResponse<?> response) {
    try {
      long seconds = Long.parseLong(response.headers().firstValue("Retry-After").orElse("30"));
      return Math.max(30000, Math.min(3600, seconds) * 1000);
    } catch (NumberFormatException ignored) {
      return 30000;
    }
  }
}
