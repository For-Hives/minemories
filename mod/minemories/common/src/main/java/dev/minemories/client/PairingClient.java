package dev.minemories.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Objects;
import java.util.Properties;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import net.minecraft.client.Minecraft;

final class PairingClient {
  private static final HttpClient HTTP =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

  private static final AtomicBoolean UPLOADING = new AtomicBoolean();
  private static final AtomicBoolean AFK_CANCELLED = new AtomicBoolean();
  private static final AtomicLong ACCOUNT_GENERATION = new AtomicLong();
  private static final DiagnosticsClient DIAGNOSTICS =
      new DiagnosticsClient(
          HTTP,
          PairingClient::readSettings,
          PairingClient::diagnosticVersions,
          settingsPath().resolveSibling("minemories-diagnostics.properties"));

  private PairingClient() {}

  record CaptureSettings(
      boolean enabled,
      boolean fullHeight,
      int tileChunks,
      ClientSettings.AfkOptions options,
      Path directory,
      String api,
      String identity,
      boolean paired,
      long generation) {}

  static CaptureSettings captureSettings() {
    Properties value = readSettings();
    return new CaptureSettings(
        ClientSettings.afkSnapshots(value),
        ClientSettings.fullHeightCapture(value),
        ClientSettings.captureTileChunks(value),
        ClientSettings.afkOptions(value),
        ClientSettings.exportDirectory(value, home()),
        apiUrl(value),
        ClientSettings.diagnosticsBinding(value, System.getenv("MINEMORIES_API_URL")),
        !value.getProperty("deviceToken", "").isBlank(),
        ACCOUNT_GENERATION.get());
  }

  static boolean isUploading() {
    return UPLOADING.get();
  }

  static boolean isPaired() {
    String token = readSettings().getProperty("deviceToken");
    return token != null && !token.isBlank();
  }

  static CompletableFuture<StorageQuota> storageStatus() {
    Properties settings = readSettings();
    String api = apiUrl(settings);
    String token = settings.getProperty("deviceToken");
    return StorageStatusClient.fetch(HTTP, api, token)
        .thenApply(
            quota -> {
              Properties current = readSettings();
              if (!api.equals(apiUrl(current))
                  || !Objects.equals(token, current.getProperty("deviceToken"))) {
                throw new CompletionException(new IllegalStateException("Compte modifié."));
              }
              return quota;
            });
  }

  static void unlink() {
    ACCOUNT_GENERATION.incrementAndGet();
    updateSettings(
        settings -> {
          settings.remove("deviceToken");
          settings.remove("deviceId");
          settings.remove("diagnosticsConsent");
          settings.remove("diagnosticsIdentity");
        });
  }

  static boolean diagnosticsConsent() {
    return ClientSettings.diagnosticsConsentForIdentity(
            readSettings(), System.getenv("MINEMORIES_API_URL"))
        && DIAGNOSTICS.consentAllowed();
  }

  static void setDiagnosticsConsent(boolean enabled) {
    DIAGNOSTICS.changeConsent(
        enabled,
        () -> {
          Properties settings = readSettings();
          if (enabled && settings.getProperty("deviceToken", "").isBlank())
            throw new IllegalStateException("Connecte ton compte avant d’activer les diagnostics.");
          settings.setProperty("diagnosticsConsent", Boolean.toString(enabled));
          if (enabled)
            settings.setProperty("diagnosticsEpoch", java.util.UUID.randomUUID().toString());
          else settings.remove("diagnosticsEpoch");
          if (enabled)
            settings.setProperty(
                "diagnosticsIdentity",
                ClientSettings.diagnosticsBinding(settings, System.getenv("MINEMORIES_API_URL")));
          else settings.remove("diagnosticsIdentity");
          saveSettings(settings);
        });
  }

  static void diagnosticsTick() {
    DIAGNOSTICS.tick();
  }

  static void reportCrash(Throwable error) {
    DIAGNOSTICS.crash(error);
  }

  static String diagnosticsStatus() {
    return DIAGNOSTICS.status();
  }

  static DiagnosticsClient.Operation beginCaptureDiagnostics() {
    return DIAGNOSTICS.begin(DiagnosticReport.Phase.CAPTURE, null);
  }

  private static DiagnosticReport.Versions diagnosticVersions() {
    return new DiagnosticReport.Versions(
        ClientPlatforms.current().modVersion(),
        net.minecraft.SharedConstants.getCurrentVersion().getName(),
        ClientPlatforms.current().loaderVersion());
  }

  static boolean isAfkSnapshots() {
    return ClientSettings.afkSnapshots(readSettings());
  }

  static void setAfkSnapshots(boolean enabled) {
    updateSettings(settings -> settings.setProperty("afkSnapshots", Boolean.toString(enabled)));
  }

  static String remoteWorldNamespace(String server) {
    return ClientSettings.remoteWorldNamespace(readSettings(), server);
  }

  static void configureRemoteWorld(String server, String namespace) {
    // Namespace changes fence off in-flight captures/uploads, just like account rebinding.
    updateSettings(
        settings -> {
          if (ClientSettings.configureRemoteWorld(settings, server, namespace))
            ACCOUNT_GENERATION.incrementAndGet();
        });
  }

  static boolean isFullHeightCapture() {
    return ClientSettings.fullHeightCapture(readSettings());
  }

  static void setFullHeightCapture(boolean enabled) {
    updateSettings(
        settings -> settings.setProperty("captureFullHeight", Boolean.toString(enabled)));
  }

  static ClientSettings.AfkOptions afkOptions() {
    return ClientSettings.afkOptions(readSettings());
  }

  static void configureAfk(ClientSettings.AfkOptions options) {
    updateSettings(settings -> ClientSettings.configureAfk(settings, options));
  }

  static long lastSnapshotAt() {
    try {
      return Long.parseLong(readSettings().getProperty("lastSnapshotAt", "0"));
    } catch (NumberFormatException error) {
      return 0;
    }
  }

  static void setLastSnapshotAt(long timestamp) {
    updateSettings(settings -> settings.setProperty("lastSnapshotAt", Long.toString(timestamp)));
  }

  static CompletableFuture<String> pair(String code) {
    long generation = ACCOUNT_GENERATION.incrementAndGet();
    Properties settings = readSettings();
    JsonObject payload = new JsonObject();
    payload.addProperty("code", code);
    payload.addProperty("name", "Minecraft client");

    HttpRequest request =
        HttpRequest.newBuilder(URI.create(apiUrl(settings) + "/api/mod/pair"))
            .timeout(Duration.ofSeconds(15))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(payload.toString()))
            .build();

    return HTTP.sendAsync(request, ApiResponseBody.bounded())
        .thenApply(
            response -> {
              if (response.statusCode() != 200) {
                throw new CompletionException(
                    new IllegalStateException("API refused (HTTP " + response.statusCode() + ")"));
              }
              JsonObject result = JsonParser.parseString(response.body()).getAsJsonObject();
              updateSettings(
                  current -> {
                    if (generation != ACCOUNT_GENERATION.get()
                        || !apiUrl(current).equals(apiUrl(settings))) {
                      throw new CompletionException(
                          new IllegalStateException(
                              "Compte ou API changé. Génère un nouveau code."));
                    }
                    current.setProperty("deviceToken", result.get("deviceToken").getAsString());
                    current.setProperty("deviceId", result.get("deviceId").getAsString());
                    current.remove("diagnosticsConsent");
                    current.remove("diagnosticsIdentity");
                  });
              return "Mod paired. You can now use /minemories upload.";
            });
  }

  static void cancelAfkUpload() {
    AFK_CANCELLED.set(true);
  }

  static CompletableFuture<String> uploadAfkCapture(Path file, CaptureSettings expected) {
    if (!expected.paired() || !expected.equals(captureSettings()))
      return CompletableFuture.failedFuture(
          new IllegalStateException("Contexte AFK modifié. Capture conservée localement."));
    return uploadCapture(file, expected);
  }

  static CompletableFuture<String> uploadCapture(Path file) {
    return uploadCapture(file, null);
  }

  private static CompletableFuture<String> uploadCapture(Path file, CaptureSettings expected) {
    Properties settings = readSettings();
    String token = settings.getProperty("deviceToken");
    if (token == null || token.isBlank()) {
      return CompletableFuture.failedFuture(
          new IllegalStateException("The mod is not paired. Use /minemories pair CODE."));
    }
    if (!Files.isRegularFile(file)) {
      return CompletableFuture.failedFuture(
          new IllegalStateException("No export found in " + file));
    }

    if (!UPLOADING.compareAndSet(false, true)) {
      return CompletableFuture.failedFuture(
          new IllegalStateException("An upload is already running."));
    }
    AFK_CANCELLED.set(false);
    var diagnostics = DIAGNOSTICS.begin(DiagnosticReport.Phase.UPLOAD, file);
    UploadPacer pacer =
        expected == null
            ? null
            : new UploadPacer(
                UploadPacer.AFK_BYTES_PER_SECOND,
                () -> !AFK_CANCELLED.get() && expected.equals(captureSettings()));
    return CompletableFuture.supplyAsync(
        () -> {
          try {
            JsonObject metadata = CaptureHistory.metadata(file);
            new ChunkedUploader(HTTP, 1000, diagnostics::headers, pacer)
                .upload(
                    apiUrl(settings),
                    token,
                    file,
                    metadata,
                    offset -> diagnostics.step(DiagnosticReport.Step.UPLOAD_CHUNK));
            diagnostics.success();
            return "Your memory is saved. Find it in your gallery.";
          } catch (InterruptedException error) {
            diagnostics.failed(error);
            Thread.currentThread().interrupt();
            throw new CompletionException(error);
          } catch (IOException error) {
            if (ChunkedUploader.isAuthorizationFailure(error)) diagnostics.revoked();
            diagnostics.failed(error);
            throw new CompletionException(error);
          } catch (RuntimeException error) {
            diagnostics.failed(error);
            throw error;
          } finally {
            UPLOADING.set(false);
          }
        });
  }

  private static Path settingsPath() {
    return Minecraft.getInstance()
        .gameDirectory
        .toPath()
        .resolve("config")
        .resolve("minemories.properties");
  }

  private static Properties readSettings() {
    try {
      return ClientSettings.read(settingsPath());
    } catch (IOException error) {
      throw new CompletionException(error);
    }
  }

  static String apiUrl() {
    return apiUrl(readSettings());
  }

  private static String apiUrl(Properties settings) {
    return ClientSettings.apiUrl(settings, System.getenv("MINEMORIES_API_URL"));
  }

  static Path exportDirectory() {
    return ClientSettings.exportDirectory(readSettings(), home());
  }

  static boolean configure(String api, String directory) {
    if (isUploading()) throw new IllegalStateException("Attends la fin de l’envoi.");
    AtomicBoolean changed = new AtomicBoolean();
    updateSettings(
        settings -> {
          String previousApi;
          try {
            previousApi = apiUrl(settings);
          } catch (IllegalArgumentException error) {
            previousApi = "invalid";
          }
          changed.set(ClientSettings.configure(settings, previousApi, api, directory, home()));
          if (changed.get()) ACCOUNT_GENERATION.incrementAndGet();
        });
    return changed.get();
  }

  private static Path home() {
    return Path.of(Objects.requireNonNull(System.getProperty("user.home"), "user.home"));
  }

  private static void saveSettings(Properties settings) {
    settings.setProperty("apiUrl", apiUrl(settings));
    try {
      ClientSettings.save(settingsPath(), settings);
      Minecraft.getInstance().execute(ClientRuntime::clientSettingsChanged);
    } catch (IOException error) {
      throw new CompletionException(error);
    }
  }

  private static void updateSettings(Consumer<Properties> mutation) {
    DIAGNOSTICS.settingsChanged(
        () -> {
          Properties settings = readSettings();
          mutation.accept(settings);
          saveSettings(settings);
        });
  }
}
