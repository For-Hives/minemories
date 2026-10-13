package dev.minemories.neoforge;

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
import net.minecraft.client.Minecraft;

final class PairingClient {
  private static final HttpClient HTTP =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

  private static final AtomicBoolean UPLOADING = new AtomicBoolean();

  private PairingClient() {}

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
    Properties settings = readSettings();
    settings.remove("deviceToken");
    settings.remove("deviceId");
    saveSettings(settings);
  }

  static boolean isAfkSnapshots() {
    return ClientSettings.afkSnapshots(readSettings());
  }

  static void setAfkSnapshots(boolean enabled) {
    Properties settings = readSettings();
    settings.setProperty("afkSnapshots", Boolean.toString(enabled));
    saveSettings(settings);
  }

  static boolean isFullHeightCapture() {
    return ClientSettings.fullHeightCapture(readSettings());
  }

  static void setFullHeightCapture(boolean enabled) {
    Properties settings = readSettings();
    settings.setProperty("captureFullHeight", Boolean.toString(enabled));
    saveSettings(settings);
  }

  static ClientSettings.AfkOptions afkOptions() {
    return ClientSettings.afkOptions(readSettings());
  }

  static void configureAfk(ClientSettings.AfkOptions options) {
    Properties settings = readSettings();
    ClientSettings.configureAfk(settings, options);
    saveSettings(settings);
  }

  static long lastSnapshotAt() {
    try {
      return Long.parseLong(readSettings().getProperty("lastSnapshotAt", "0"));
    } catch (NumberFormatException error) {
      return 0;
    }
  }

  static void setLastSnapshotAt(long timestamp) {
    Properties settings = readSettings();
    settings.setProperty("lastSnapshotAt", Long.toString(timestamp));
    saveSettings(settings);
  }

  static CompletableFuture<String> pair(String code) {
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
              Properties current = readSettings();
              if (!apiUrl(current).equals(apiUrl(settings))) {
                throw new CompletionException(
                    new IllegalStateException("API changed. Generate a new code."));
              }
              current.setProperty("deviceToken", result.get("deviceToken").getAsString());
              current.setProperty("deviceId", result.get("deviceId").getAsString());
              saveSettings(current);
              return "Mod paired. You can now use /minemories upload.";
            });
  }

  static CompletableFuture<String> uploadCapture(Path file) {
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
    return CompletableFuture.supplyAsync(
        () -> {
          try {
            JsonObject metadata = CaptureHistory.metadata(file);
            new ChunkedUploader(HTTP, 1000)
                .upload(apiUrl(settings), token, file, metadata, offset -> {});
            return "Your memory is saved. Find it in your gallery.";
          } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new CompletionException(error);
          } catch (IOException error) {
            throw new CompletionException(error);
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
    Properties settings = readSettings();
    String previousApi;
    try {
      previousApi = apiUrl(settings);
    } catch (IllegalArgumentException error) {
      previousApi = "invalid";
    }
    boolean changed = ClientSettings.configure(settings, previousApi, api, directory, home());
    saveSettings(settings);
    return changed;
  }

  private static Path home() {
    return Path.of(Objects.requireNonNull(System.getProperty("user.home"), "user.home"));
  }

  private static void saveSettings(Properties settings) {
    settings.setProperty("apiUrl", apiUrl(settings));
    try {
      ClientSettings.save(settingsPath(), settings);
    } catch (IOException error) {
      throw new CompletionException(error);
    }
  }
}
