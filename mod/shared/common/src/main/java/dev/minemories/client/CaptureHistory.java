package dev.minemories.client;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.PriorityQueue;
import java.util.UUID;
import java.util.function.Supplier;
import java.util.regex.Pattern;

final class CaptureHistory {
  static final int PAGE_SIZE = 4;
  static final int MAX_METADATA_BYTES = 2 * 1024 * 1024;
  private static final String POINTER = ".minemories-latest";
  private static final DateTimeFormatter TIMESTAMP =
      DateTimeFormatter.ofPattern("uuuuMMdd'T'HHmmssSSS'Z'").withZone(ZoneOffset.UTC);
  private static final Pattern ID =
      Pattern.compile("capture-\\d{8}T\\d{9}Z-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}");

  private CaptureHistory() {}

  @FunctionalInterface
  interface Writer {
    void write(Path file) throws IOException;
  }

  record Entry(
      String id, Path file, Instant capturedAt, long bytes, String world, boolean readable) {}

  record Page(List<Entry> entries, boolean hasMore) {
    Page {
      entries = List.copyOf(entries);
    }
  }

  static synchronized Path save(Path directory, Instant capturedAt, String metadata, Writer writer)
      throws IOException {
    byte[] json = metadata.getBytes(StandardCharsets.UTF_8);
    if (json.length > MAX_METADATA_BYTES) throw new IOException("Métadonnées trop volumineuses.");
    return saveWritten(directory, capturedAt, writer, file -> Files.write(file, json));
  }

  /**
   * Preparation finishes before metadata is evaluated, so the recorded end includes GLB writing.
   */
  static synchronized Path savePrepared(
      Path directory, Instant capturedAt, Supplier<String> metadata, Writer writer)
      throws IOException {
    return saveWritten(
        directory,
        capturedAt,
        writer,
        file -> {
          byte[] json = metadata.get().getBytes(StandardCharsets.UTF_8);
          if (json.length > MAX_METADATA_BYTES)
            throw new IOException("Métadonnées trop volumineuses.");
          Files.write(file, json);
        });
  }

  private static Path saveWritten(
      Path directory, Instant capturedAt, Writer writer, Writer metadata) throws IOException {
    interrupted();
    Path history = directory.resolve("history");
    Files.createDirectories(history);
    requireDirectory(history);
    preserveLegacy(directory, history);
    Path saved = commit(history, capturedAt, writer, metadata);
    replaceAlias(saved.resolve("capture.json"), directory.resolve("capture.json"));
    replaceAlias(saved.resolve("capture.glb"), directory.resolve("capture.glb"));
    writePointer(directory, filename(saved));
    return saved.resolve("capture.glb");
  }

  private static Path commit(Path history, Instant time, Writer glb, Writer metadata)
      throws IOException {
    interrupted();
    String id = "capture-" + TIMESTAMP.format(time) + "-" + UUID.randomUUID();
    if (!ID.matcher(id).matches()) throw new IOException("Date de capture invalide.");
    Path staging = Files.createTempDirectory(history, ".pending-");
    try {
      glb.write(staging.resolve("capture.glb"));
      interrupted();
      metadata.write(staging.resolve("capture.json"));
      interrupted();
      if (!Files.isRegularFile(staging.resolve("capture.glb"), LinkOption.NOFOLLOW_LINKS)
          || Files.size(staging.resolve("capture.glb")) == 0) {
        throw new IOException("Capture vide ou incomplète.");
      }
      Path destination = history.resolve(id);
      move(staging, destination);
      return destination;
    } finally {
      Files.deleteIfExists(staging.resolve("capture.glb"));
      Files.deleteIfExists(staging.resolve("capture.json"));
      Files.deleteIfExists(staging);
    }
  }

  private static void interrupted() throws java.io.InterruptedIOException {
    if (Thread.currentThread().isInterrupted())
      throw new java.io.InterruptedIOException("Capture publication interrupted");
  }

  private static void preserveLegacy(Path directory, Path history) throws IOException {
    if (Files.exists(directory.resolve(POINTER), LinkOption.NOFOLLOW_LINKS)) return;
    Path glb = directory.resolve("capture.glb");
    if (!Files.isRegularFile(glb, LinkOption.NOFOLLOW_LINKS)) return;
    Path json = directory.resolve("capture.json");
    Instant time = Files.getLastModifiedTime(glb, LinkOption.NOFOLLOW_LINKS).toInstant();
    Path imported =
        commit(
            history,
            time,
            file -> Files.copy(glb, file),
            file -> {
              if (Files.isRegularFile(json, LinkOption.NOFOLLOW_LINKS)) Files.copy(json, file);
              else Files.writeString(file, "{\"capturedAt\":\"" + time + "\"}");
            });
    Path resume = glb.resolveSibling("capture.glb.upload.properties");
    if (Files.isRegularFile(resume, LinkOption.NOFOLLOW_LINKS)) {
      Files.copy(resume, imported.resolve(filename(resume)));
    }
    writePointer(directory, filename(imported));
  }

  static Path latest(Path directory) throws IOException {
    migrateLegacy(directory);
    Path pointer = directory.resolve(POINTER);
    if (!Files.exists(pointer, LinkOption.NOFOLLOW_LINKS)) return directory.resolve("capture.glb");
    String id = boundedText(pointer, 96);
    if (!ID.matcher(id).matches()) throw new IOException("Référence de capture illisible.");
    Path history = directory.resolve("history");
    requireDirectory(history);
    Path folder = history.resolve(id);
    requireDirectory(folder);
    Path file = folder.resolve("capture.glb");
    if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) {
      throw new IOException("La dernière capture locale est introuvable.");
    }
    return file;
  }

  private static void migrateLegacy(Path directory) throws IOException {
    // Existing pointers (and fresh folders) need no migration. Readers must not wait for
    // a background GLB writer just to discover that their already published history is ready.
    if (!needsLegacyMigration(directory)) return;
    synchronized (CaptureHistory.class) {
      if (!needsLegacyMigration(directory)) return;
      Path history = directory.resolve("history");
      Files.createDirectories(history);
      requireDirectory(history);
      preserveLegacy(directory, history);
    }
  }

  private static boolean needsLegacyMigration(Path directory) {
    if (Files.exists(directory.resolve(POINTER), LinkOption.NOFOLLOW_LINKS)
        || !Files.isRegularFile(directory.resolve("capture.glb"), LinkOption.NOFOLLOW_LINKS))
      return false;
    return true;
  }

  private static void writePointer(Path directory, String id) throws IOException {
    Path staged = Files.createTempFile(directory, ".latest-", ".tmp");
    try {
      Files.writeString(staged, id);
      move(staged, directory.resolve(POINTER));
    } finally {
      Files.deleteIfExists(staged);
    }
  }

  private static void replaceAlias(Path source, Path target) throws IOException {
    Path staged =
        Files.createTempFile(
            Objects.requireNonNull(target.getParent(), "Capture path has no parent"),
            ".latest-",
            ".tmp");
    try {
      Files.copy(source, staged, StandardCopyOption.REPLACE_EXISTING);
      move(staged, target);
    } finally {
      Files.deleteIfExists(staged);
    }
  }

  private static void move(Path source, Path target) throws IOException {
    try {
      Files.move(
          source, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    } catch (AtomicMoveNotSupportedException error) {
      Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
    }
  }

  private static void requireDirectory(Path directory) throws IOException {
    if (!Files.isDirectory(directory, LinkOption.NOFOLLOW_LINKS)) {
      throw new IOException("Dossier d’historique indisponible.");
    }
  }

  private static String filename(Path file) {
    // All callers pass a child of the configured export folder.
    return Objects.requireNonNull(file.getFileName(), "Capture path has no filename").toString();
  }

  static JsonObject metadata(Path capture) throws IOException {
    Path sidecar = capture.resolveSibling("capture.json");
    if (!Files.exists(sidecar, LinkOption.NOFOLLOW_LINKS)) {
      JsonObject unknown = new JsonObject();
      unknown.addProperty(
          "capturedAt",
          Files.getLastModifiedTime(capture, LinkOption.NOFOLLOW_LINKS).toInstant().toString());
      return unknown;
    }
    try {
      return JsonParser.parseString(boundedText(sidecar, MAX_METADATA_BYTES)).getAsJsonObject();
    } catch (RuntimeException error) {
      throw new IOException("Métadonnées de cette capture illisibles.", error);
    }
  }

  private static String boundedText(Path file, int limit) throws IOException {
    if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) {
      throw new IOException("Fichier de capture indisponible.");
    }
    try (var input = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS)) {
      byte[] bytes = input.readNBytes(limit + 1);
      if (bytes.length > limit) throw new IOException("Fichier de capture trop volumineux.");
      return StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString();
    }
  }

  static Page list(Path directory, String before, int limit) throws IOException {
    if (limit < 1 || limit > 100) throw new IllegalArgumentException("Page trop grande.");
    if (before != null && !ID.matcher(before).matches()) {
      throw new IllegalArgumentException("Page invalide.");
    }
    migrateLegacy(directory);
    Path history = directory.resolve("history");
    if (!Files.exists(history, LinkOption.NOFOLLOW_LINKS)) return new Page(List.of(), false);
    requireDirectory(history);
    PriorityQueue<Entry> newest = new PriorityQueue<>(Comparator.comparing(Entry::id));
    try (var folders = Files.newDirectoryStream(history)) {
      for (Path folder : folders) {
        String id = filename(folder);
        if (!ID.matcher(id).matches() || (before != null && id.compareTo(before) >= 0)) continue;
        if (!Files.isDirectory(folder, LinkOption.NOFOLLOW_LINKS)) continue;
        Path file = folder.resolve("capture.glb");
        if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)) continue;
        Instant time;
        try {
          time = LocalDateTime.parse(id.substring(8, 27), TIMESTAMP).toInstant(ZoneOffset.UTC);
        } catch (RuntimeException error) {
          continue;
        }
        BasicFileAttributes attributes =
            Files.readAttributes(file, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        newest.add(new Entry(id, file, time, attributes.size(), "", true));
        if (newest.size() > limit + 1) newest.remove();
      }
    }
    boolean hasMore = newest.size() > limit;
    if (hasMore) newest.remove();
    List<Entry> entries = new ArrayList<>();
    for (Entry entry :
        newest.stream().sorted(Comparator.comparing(Entry::id).reversed()).toList()) {
      entries.add(describe(entry));
    }
    return new Page(entries, hasMore);
  }

  private static Entry describe(Entry entry) {
    String world = "Monde non renseigné";
    boolean readable = true;
    try {
      JsonObject json = metadata(entry.file());
      for (String key : List.of("worldName", "serverName")) {
        var value = json.get(key);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString())
          continue;
        String name = value.getAsString().replaceAll("[\\p{Cntrl}§]", " ").strip();
        if (!name.isEmpty()) {
          world = name.substring(0, Math.min(name.length(), 160));
          break;
        }
      }
    } catch (IOException error) {
      readable = false;
      world = "Métadonnées illisibles";
    }
    return new Entry(entry.id(), entry.file(), entry.capturedAt(), entry.bytes(), world, readable);
  }
}
