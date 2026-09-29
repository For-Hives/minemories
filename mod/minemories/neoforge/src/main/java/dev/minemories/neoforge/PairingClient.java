package dev.minemories.neoforge;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.io.StringWriter;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
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
import net.minecraft.client.Minecraft;

final class PairingClient {
  private static final HttpClient HTTP =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

  private PairingClient() {}

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

    try {
      long size = Files.size(file);
      if (size > 100L * 1024 * 1024) {
        return CompletableFuture.failedFuture(
            new IllegalStateException("The GLB exceeds the 100 MB limit."));
      }
    } catch (IOException error) {
      return CompletableFuture.failedFuture(error);
    }

    try (var input = Files.newInputStream(file)) {
      byte[] magic = input.readNBytes(4);
      if (magic.length != 4
          || magic[0] != 'g'
          || magic[1] != 'l'
          || magic[2] != 'T'
          || magic[3] != 'F') {
        return CompletableFuture.failedFuture(
            new IllegalStateException("The file does not look like a valid GLB."));
      }
    } catch (IOException error) {
      return CompletableFuture.failedFuture(error);
    }

    HttpRequest request;
    try {
      JsonObject metadata = Minemories.captureMetadata();
      request =
          HttpRequest.newBuilder(URI.create(apiUrl(settings) + "/api/mod/memories"))
              .timeout(Duration.ofMinutes(3))
              .header("Authorization", "Bearer " + token)
              .header("Content-Type", "model/gltf-binary")
              .header("X-Memory-Name", "Minecraft capture")
              .header(
                  "X-Memory-Metadata",
                  java.util.Base64.getUrlEncoder()
                      .withoutPadding()
                      .encodeToString(metadata.toString().getBytes(StandardCharsets.UTF_8)))
              .POST(HttpRequest.BodyPublishers.ofFile(file))
              .build();
    } catch (IOException error) {
      return CompletableFuture.failedFuture(error);
    }

    return HTTP.sendAsync(request, HttpResponse.BodyHandlers.ofString())
        .thenApply(
            response -> {
              if (response.statusCode() != 201) {
                throw new CompletionException(
                    new IllegalStateException(
                        "Upload refused (HTTP " + response.statusCode() + ")"));
              }
              return "Your memory is saved. Find it in your gallery.";
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
