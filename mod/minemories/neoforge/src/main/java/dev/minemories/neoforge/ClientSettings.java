package dev.minemories.neoforge;

import java.io.IOException;
import java.io.StringWriter;
import java.net.URI;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermission;
import java.util.EnumSet;
import java.util.Objects;
import java.util.Properties;

final class ClientSettings {
  static final String DEFAULT_API_URL = "https://api.minemories.xenos.lightin.io";

  private ClientSettings() {}

  static Properties read(Path path) throws IOException {
    Properties settings = new Properties();
    if (Files.isRegularFile(path)) {
      try (var reader = Files.newBufferedReader(path)) {
        settings.load(reader);
      }
    }
    return settings;
  }

  static void save(Path path, Properties settings) throws IOException {
    Path temporary = path.resolveSibling(path.getFileName() + ".tmp");
    Files.createDirectories(Objects.requireNonNull(path.getParent()));
    try {
      Files.deleteIfExists(temporary);
      try {
        Files.createFile(
            temporary,
            java.nio.file.attribute.PosixFilePermissions.asFileAttribute(
                EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE)));
      } catch (UnsupportedOperationException ignored) {
        Files.createFile(temporary);
      }
      try (StringWriter writer = new StringWriter()) {
        settings.store(writer, "Minemories client settings; do not share device credentials");
        Files.writeString(temporary, writer.toString());
      }
      try {
        Files.move(
            temporary, path, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
      } catch (AtomicMoveNotSupportedException ignored) {
        Files.move(temporary, path, StandardCopyOption.REPLACE_EXISTING);
      }
    } finally {
      Files.deleteIfExists(temporary);
    }
  }

  static String apiUrl(Properties settings, String environmentApi) {
    String configured = settings.getProperty("apiUrl");
    if (configured == null || configured.isBlank()) configured = environmentApi;
    if (configured == null || configured.isBlank()) configured = DEFAULT_API_URL;
    return normalizeApiUrl(configured);
  }

  static String normalizeApiUrl(String value) {
    URI uri;
    try {
      uri = URI.create(value.strip().replaceAll("/+$", ""));
    } catch (IllegalArgumentException error) {
      throw new IllegalArgumentException("Adresse API invalide.", error);
    }
    String host = uri.getHost();
    boolean local = "localhost".equals(host) || "127.0.0.1".equals(host) || "[::1]".equals(host);
    if (host == null
        || !("https".equals(uri.getScheme()) || (local && "http".equals(uri.getScheme())))
        || uri.getUserInfo() != null
        || uri.getQuery() != null
        || uri.getFragment() != null) {
      throw new IllegalArgumentException("Utilise une URL HTTPS (HTTP seulement sur localhost).");
    }
    return uri.toString();
  }

  static Path exportDirectory(Properties settings, Path home) {
    String directory = settings.getProperty("exportDirectory", "").strip();
    Path result;
    if (directory.isEmpty() || directory.equals("~")) {
      result = directory.isEmpty() ? home.resolve("export") : home;
    } else if (directory.startsWith("~/")) {
      result = home.resolve(directory.substring(2));
    } else {
      result = Path.of(directory);
    }
    if (!result.isAbsolute()) {
      throw new IllegalArgumentException("Choisis un chemin absolu pour le dossier local.");
    }
    return result.normalize();
  }

  static boolean afkSnapshots(Properties settings) {
    return Boolean.parseBoolean(settings.getProperty("afkSnapshots", "true"));
  }

  record AfkOptions(int idleMinutes, int intervalMinutes, int radius) {
    AfkOptions {
      if (idleMinutes < 1
          || idleMinutes > 1440
          || intervalMinutes < 1
          || intervalMinutes > 10080
          || radius < 2
          || radius > 128) {
        throw new IllegalArgumentException(
            "AFK : délai 1–1440 min, intervalle 1–10080 min, rayon 2–128 blocs.");
      }
    }
  }

  static AfkOptions afkOptions(Properties settings) {
    try {
      return new AfkOptions(
          Integer.parseInt(settings.getProperty("afkIdleMinutes", "5")),
          Integer.parseInt(settings.getProperty("afkIntervalMinutes", "240")),
          Integer.parseInt(settings.getProperty("captureRadius", "32")));
    } catch (IllegalArgumentException error) {
      return new AfkOptions(5, 240, 32);
    }
  }

  static void configureAfk(Properties settings, AfkOptions options) {
    settings.setProperty("afkIdleMinutes", Integer.toString(options.idleMinutes()));
    settings.setProperty("afkIntervalMinutes", Integer.toString(options.intervalMinutes()));
    settings.setProperty("captureRadius", Integer.toString(options.radius()));
  }

  static boolean configure(
      Properties settings, String currentApi, String newApi, String directory, Path home) {
    String normalizedApi = normalizeApiUrl(newApi);
    Properties candidate = new Properties();
    candidate.setProperty("exportDirectory", directory);
    Path normalizedDirectory = exportDirectory(candidate, home);
    boolean changedApi = !normalizedApi.equals(currentApi);
    if (changedApi) {
      settings.remove("deviceToken");
      settings.remove("deviceId");
    }
    settings.setProperty("apiUrl", normalizedApi);
    settings.setProperty("exportDirectory", normalizedDirectory.toString());
    return changedApi;
  }
}
