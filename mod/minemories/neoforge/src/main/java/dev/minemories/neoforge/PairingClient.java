package dev.minemories.neoforge;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.StringWriter;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermission;
import java.time.Duration;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Properties;
import java.util.Set;
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

  static void unlink() {
    Properties settings = readSettings();
    settings.remove("deviceToken");
    settings.remove("deviceId");
    saveSettings(settings);
  }

  static boolean isAfkSnapshots() {
    return !"false".equalsIgnoreCase(readSettings().getProperty("afkSnapshots", "true"));
  }

  static void setAfkSnapshots(boolean enabled) {
    Properties settings = readSettings();
    settings.setProperty("afkSnapshots", Boolean.toString(enabled));
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

    return HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString())
        .thenApply(
            response -> {
              if (response.statusCode() != 200) {
                throw new CompletionException(
                    new IllegalStateException("API refused (HTTP " + response.statusCode() + ")"));
              }
              JsonObject result = JsonParser.parseString(response.body()).getAsJsonObject();
              settings.setProperty("deviceToken", result.get("deviceToken").getAsString());
              settings.setProperty("deviceId", result.get("deviceId").getAsString());
              saveSettings(settings);
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
    JsonObject metadata;
    try {
      // Read Minecraft state on the caller's client thread, before starting background I/O.
      metadata = Minemories.captureMetadata();
    } catch (RuntimeException error) {
      UPLOADING.set(false);
      return CompletableFuture.failedFuture(error);
    }
    return CompletableFuture.supplyAsync(
        () -> {
          try {
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
    Properties settings = new Properties();
    Path path = settingsPath();
    if (Files.isRegularFile(path)) {
      try (var reader = Files.newBufferedReader(path)) {
        settings.load(reader);
      } catch (IOException error) {
        throw new CompletionException(error);
      }
    }
    return settings;
  }

  private static String apiUrl(Properties settings) {
    String configured = settings.getProperty("apiUrl");
    if (configured == null || configured.isBlank()) {
      configured = System.getenv().getOrDefault("MINEMORIES_API_URL", "http://localhost:3001");
    }
    return configured.replaceAll("/+$", "");
  }

  private static void saveSettings(Properties settings) {
    Path path = settingsPath();
    Path temporary = path.resolveSibling("minemories.properties.tmp");
    settings.setProperty("apiUrl", apiUrl(settings));
    try {
      Files.createDirectories(Objects.requireNonNull(path.getParent()));
      try (StringWriter writer = new StringWriter()) {
        settings.store(writer, "Minemories paired client credentials");
        Files.writeString(temporary, writer.toString());
      }
      try {
        Set<PosixFilePermission> ownerOnly =
            EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE);
        Files.setPosixFilePermissions(temporary, ownerOnly);
      } catch (UnsupportedOperationException ignored) {
        // Windows does not expose POSIX file permissions.
      }
      try {
        Files.move(
            temporary, path, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
      } catch (AtomicMoveNotSupportedException ignored) {
        Files.move(temporary, path, StandardCopyOption.REPLACE_EXISTING);
      }
    } catch (IOException error) {
      throw new CompletionException(error);
    }
  }
}
