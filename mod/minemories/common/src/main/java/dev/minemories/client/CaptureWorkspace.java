package dev.minemories.client;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

/** Capture-owned scratch files only. Complete history/GLB files never belong to this workspace. */
final class CaptureWorkspace implements AutoCloseable {
  private static final byte[] OWNER =
      "MINEMORIES_CAPTURE_WORK_V1\n".getBytes(StandardCharsets.UTF_8);
  private static final Pattern JOB =
      Pattern.compile("\\.minemories-work-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}");
  private static final Pattern ROOT_FILE =
      Pattern.compile("texture-\\d{1,4}\\.png|\\.owner|\\.lock");
  private static final Pattern SPOOL = Pattern.compile("\\.minemories-spool-\\d{1,20}");
  private static final Pattern SPOOL_FILE =
      Pattern.compile("p\\d{1,4}-(?:positions|normals|uvs|indices)|image-\\d{1,4}|scene-json");
  private static final int MAX_FILES = 22_000;
  private final Path directory;
  private final Object identity;
  private final FileChannel channel;
  private final FileLock lock;
  private boolean closed;

  private record Owned(Path path, Object identity, boolean directory) {}

  CaptureWorkspace(Path parent) throws IOException {
    Files.createDirectories(parent);
    requireDirectory(parent);
    directory = parent.resolve(".minemories-work-" + UUID.randomUUID());
    try {
      Files.createDirectory(
          directory,
          PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
    } catch (UnsupportedOperationException unsupported) {
      Files.createDirectory(directory);
    }
    identity = requireDirectory(directory).fileKey();
    FileChannel opened = null;
    FileLock acquired = null;
    boolean marker = false, lockFile = false;
    try {
      opened =
          FileChannel.open(
              directory.resolve(".lock"),
              StandardOpenOption.CREATE_NEW,
              StandardOpenOption.WRITE,
              LinkOption.NOFOLLOW_LINKS);
      lockFile = true;
      acquired = opened.lock();
      // Make ownership visible only after holding the inter-process lock.
      Files.write(directory.resolve(".owner"), OWNER, StandardOpenOption.CREATE_NEW);
      marker = true;
      channel = opened;
      lock = acquired;
    } catch (IOException | RuntimeException error) {
      if (acquired != null) acquired.close();
      if (opened != null) opened.close();
      try {
        if (marker) Files.deleteIfExists(directory.resolve(".owner"));
        if (lockFile) Files.deleteIfExists(directory.resolve(".lock"));
        Files.deleteIfExists(directory);
      } catch (IOException cleanup) {
        error.addSuppressed(cleanup);
      }
      throw error;
    }
  }

  Path directory() {
    return directory;
  }

  static int cleanupAbandoned(Path parent, int maximum) throws IOException {
    if (maximum < 1 || maximum > 64) throw new IllegalArgumentException("Invalid cleanup budget");
    if (!Files.exists(parent, LinkOption.NOFOLLOW_LINKS)) return 0;
    requireDirectory(parent);
    int inspected = 0, cleaned = 0, entries = 0;
    try (var paths = Files.newDirectoryStream(parent)) {
      for (Path path : paths) {
        if (++entries > 1024 || inspected == maximum) break;
        if (!JOB.matcher(filename(path)).matches()) continue;
        inspected++;
        if (cleanupOne(path)) cleaned++;
      }
    }
    return cleaned;
  }

  private static boolean cleanupOne(Path directory) {
    try {
      Object identity = requireDirectory(directory).fileKey();
      if (!hasOwner(directory)) return false;
      List<Owned> owned;
      try (FileChannel channel =
          FileChannel.open(
              directory.resolve(".lock"), StandardOpenOption.WRITE, LinkOption.NOFOLLOW_LINKS)) {
        try (FileLock acquired = channel.tryLock()) {
          if (acquired == null) return false;
          owned = inventory(directory);
          removeContent(directory, identity, owned);
        }
      }
      removeMarkers(directory, identity, owned);
      return true;
    } catch (IOException | OverlappingFileLockException error) {
      // Another client, replacement or inaccessible/unknown files: preserve, retry on a later
      // capture.
      return false;
    }
  }

  private static boolean hasOwner(Path directory) throws IOException {
    Path marker = directory.resolve(".owner");
    var attributes = attributes(marker);
    if (!attributes.isRegularFile() || attributes.size() != OWNER.length) return false;
    try (var input = Files.newInputStream(marker, LinkOption.NOFOLLOW_LINKS)) {
      return Arrays.equals(OWNER, input.readNBytes(OWNER.length + 1));
    }
  }

  private static List<Owned> inventory(Path directory) throws IOException {
    List<Owned> owned = new ArrayList<>();
    try (var paths = Files.newDirectoryStream(directory)) {
      for (Path path : paths) {
        var attributes = attributes(path);
        String name = filename(path);
        if (attributes.isDirectory() && SPOOL.matcher(name).matches()) {
          try (var parts = Files.newDirectoryStream(path)) {
            for (Path part : parts) {
              var info = attributes(part);
              if (!info.isRegularFile() || !SPOOL_FILE.matcher(filename(part)).matches())
                throw new IOException("Unknown scratch entry; preserving workspace");
              addOwned(owned, part, info);
            }
          }
          addOwned(owned, path, attributes);
        } else {
          if (!attributes.isRegularFile() || !ROOT_FILE.matcher(name).matches())
            throw new IOException("Unknown scratch entry; preserving workspace");
          addOwned(owned, path, attributes);
        }
      }
    }
    return owned;
  }

  private static void addOwned(List<Owned> owned, Path path, BasicFileAttributes attributes)
      throws IOException {
    if (attributes.fileKey() == null || owned.size() == MAX_FILES)
      throw new IOException("Scratch identity or entry limit unavailable");
    owned.add(new Owned(path, attributes.fileKey(), attributes.isDirectory()));
  }

  private static void removeContent(Path directory, Object identity, List<Owned> owned)
      throws IOException {
    for (Owned file : owned) {
      String name = filename(file.path);
      if (name.equals(".owner") || name.equals(".lock")) continue;
      requireIdentity(directory, identity);
      requireIdentity(file.path, file.identity);
      Files.delete(file.path);
    }
  }

  private static void removeMarkers(Path directory, Object identity, List<Owned> owned)
      throws IOException {
    requireIdentity(directory, identity);
    for (Owned file : owned) {
      String name = filename(file.path);
      if (!name.equals(".owner") && !name.equals(".lock")) continue;
      requireIdentity(directory, identity);
      requireIdentity(file.path, file.identity);
      Files.delete(file.path);
    }
    requireIdentity(directory, identity);
    Files.delete(directory);
  }

  private static String filename(Path path) {
    // Directory-stream children have a name; fail explicitly if a provider violates that contract.
    return Objects.requireNonNull(path.getFileName(), "Scratch entry has no filename").toString();
  }

  private static BasicFileAttributes attributes(Path path) throws IOException {
    return Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
  }

  private static BasicFileAttributes requireDirectory(Path path) throws IOException {
    var attributes = attributes(path);
    if (!attributes.isDirectory() || attributes.fileKey() == null)
      throw new IOException("Invalid scratch directory");
    return attributes;
  }

  private static void requireIdentity(Path path, Object identity) throws IOException {
    if (!Objects.equals(identity, attributes(path).fileKey()))
      throw new IOException("Scratch entry replaced");
  }

  @Override
  public void close() throws IOException {
    if (closed) return;
    List<Owned> owned;
    try {
      requireIdentity(directory, identity);
      if (!hasOwner(directory)) throw new IOException("Scratch owner marker changed");
      owned = inventory(directory);
      removeContent(directory, identity, owned);
    } catch (NoSuchFileException missing) {
      if (Files.exists(directory, LinkOption.NOFOLLOW_LINKS)) throw missing;
      closed = true;
      return;
    } finally {
      if (lock.isValid()) lock.close();
      if (channel.isOpen()) channel.close();
    }
    removeMarkers(directory, identity, owned);
    closed = true;
  }
}
