package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CaptureHistoryTest {
  @TempDir Path directory;
  private static final Instant TIME = Instant.parse("2026-10-12T12:34:56.123Z");

  private Path save(Instant time, String value, String world) throws IOException {
    return CaptureHistory.save(
        directory,
        time,
        "{\"worldName\":\"" + world + "\",\"capturedAt\":\"" + time + "\"}",
        file -> Files.writeString(file, value));
  }

  @Test
  void capturesNeverOverwriteOneAnotherAndLatestAliasKeepsTheExistingContract() throws IOException {
    Path first = save(TIME, "first model", "First world");
    Path second = save(TIME, "second model", "Second world");
    assertNotEquals(first, second);
    assertEquals("first model", Files.readString(first));
    assertEquals("second model", Files.readString(second));
    assertEquals(second, CaptureHistory.latest(directory));
    assertEquals("second model", Files.readString(directory.resolve("capture.glb")));
    assertEquals(
        Files.readString(second.resolveSibling("capture.json")),
        Files.readString(directory.resolve("capture.json")));
    assertEquals("First world", CaptureHistory.metadata(first).get("worldName").getAsString());
    assertEquals(2, CaptureHistory.list(directory, null, 4).entries().size());
    Files.delete(directory.resolve("capture.glb"));
    assertEquals(second, CaptureHistory.latest(directory));
  }

  @Test
  void migrationPreservesThePreviousModelMetadataAndResumableUploadExactlyOnce()
      throws IOException {
    Files.writeString(directory.resolve("capture.glb"), "legacy model");
    Files.setLastModifiedTime(
        directory.resolve("capture.glb"), FileTime.from(TIME.minusSeconds(60)));
    Files.writeString(directory.resolve("capture.json"), "{\"serverName\":\"Old server\"}");
    Files.writeString(directory.resolve("capture.glb.upload.properties"), "id=test-resume");
    var legacy = CaptureHistory.list(directory, null, 4);
    assertEquals("Old server", legacy.entries().getFirst().world());
    assertEquals(legacy.entries().getFirst().file(), CaptureHistory.latest(directory));
    save(TIME, "new model", "New world");
    save(TIME.plusSeconds(1), "third model", "Third world");
    var page = CaptureHistory.list(directory, null, 4);
    assertEquals(3, page.entries().size());
    var old = page.entries().getLast();
    assertEquals(TIME.minusSeconds(60), old.capturedAt());
    assertEquals("legacy model", Files.readString(old.file()));
    assertEquals("Old server", old.world());
    assertEquals(
        "id=test-resume",
        Files.readString(old.file().resolveSibling("capture.glb.upload.properties")));
  }

  @Test
  void firstUploadPinsTheLegacyModelBeforeAnyNewExport() throws IOException {
    Files.writeString(directory.resolve("capture.glb"), "old model");
    Files.writeString(directory.resolve("capture.json"), "{\"worldName\":\"Old world\"}");
    Path pinned = CaptureHistory.latest(directory);
    assertNotEquals(directory.resolve("capture.glb"), pinned);
    save(TIME, "new model", "New world");
    assertEquals("old model", Files.readString(pinned));
    assertEquals("Old world", CaptureHistory.metadata(pinned).get("worldName").getAsString());
    assertEquals("new model", Files.readString(directory.resolve("capture.glb")));
  }

  @Test
  void deletingTheLatestHistoryFolderDoesNotPreventFutureCaptures() throws IOException {
    Path previous = save(TIME, "previous model", "Previous world");
    Files.delete(previous.resolveSibling("capture.json"));
    Files.delete(previous);
    Files.delete(java.util.Objects.requireNonNull(previous.getParent()));
    assertThrows(IOException.class, () -> CaptureHistory.latest(directory));
    Path next = save(TIME.plusSeconds(5), "new model", "New world");
    assertEquals(next, CaptureHistory.latest(directory));
    assertEquals("new model", Files.readString(directory.resolve("capture.glb")));
  }

  @Test
  void sceneWithoutGeometryKeepsTheLatestModelMetadataAndReference() throws IOException {
    Path previous = save(TIME, "previous model", "Previous world");
    String json = Files.readString(directory.resolve("capture.json"));
    var scene = new dev.minemories.core.GlbScene();
    scene.addPointLight(0, 0, 0, 0xFFFFFF, 15);
    assertThrows(
        IOException.class,
        () ->
            CaptureHistory.save(
                directory, TIME.plusSeconds(1), "{\"worldName\":\"Empty world\"}", scene::write));
    assertEquals(previous, CaptureHistory.latest(directory));
    assertEquals("previous model", Files.readString(directory.resolve("capture.glb")));
    assertEquals(json, Files.readString(directory.resolve("capture.json")));
    assertEquals(1, CaptureHistory.list(directory, null, 4).entries().size());
    try (var files = Files.list(directory.resolve("history"))) {
      assertEquals(List.of(previous.getParent()), files.toList());
    }
  }

  @Test
  void failedAndEmptyWritersLeaveThePreviousCaptureIntactAndNoPendingDirectories()
      throws IOException {
    Path first = save(TIME, "previous valid model", "Previous world");
    assertThrows(
        IOException.class,
        () ->
            CaptureHistory.save(
                directory,
                TIME,
                "{}",
                file -> {
                  Files.writeString(file, "partial model");
                  throw new IOException("disk failure");
                }));
    assertThrows(
        IOException.class,
        () -> CaptureHistory.save(directory, TIME, "{}", file -> Files.createFile(file)));
    assertEquals(first, CaptureHistory.latest(directory));
    assertEquals("previous valid model", Files.readString(directory.resolve("capture.glb")));
    assertEquals(
        "Previous world",
        CaptureHistory.metadata(directory.resolve("capture.glb")).get("worldName").getAsString());
    try (var files = Files.list(directory.resolve("history"))) {
      assertEquals(List.of(first.getParent()), files.toList());
    }
  }

  @Test
  void missingLegacyMetadataDoesNotBorrowTheCurrentlyOpenWorld() throws IOException {
    Path file = directory.resolve("capture.glb");
    Files.writeString(file, "legacy");
    Files.setLastModifiedTime(file, FileTime.from(TIME));
    assertEquals(TIME.toString(), CaptureHistory.metadata(file).get("capturedAt").getAsString());
    assertFalse(CaptureHistory.metadata(file).has("worldName"));
    save(TIME.plusSeconds(5), "new", "New world");
    var legacy = CaptureHistory.list(directory, null, 4).entries().getLast();
    assertEquals("Monde non renseigné", legacy.world());
    assertFalse(CaptureHistory.metadata(legacy.file()).has("worldName"));
  }

  @Test
  void paginationIsNewestFirstWithoutLosingOrDuplicatingCaptures() throws IOException {
    for (int i = 0; i < 13; i++) save(TIME.plusSeconds(i), "model " + i, "World " + i);
    var page = CaptureHistory.list(directory, null, 4);
    assertEquals(
        List.of("World 12", "World 11", "World 10", "World 9"),
        page.entries().stream().map(CaptureHistory.Entry::world).toList());
    int seen = page.entries().size();
    while (page.hasMore()) {
      page = CaptureHistory.list(directory, page.entries().getLast().id(), 4);
      seen += page.entries().size();
    }
    assertEquals(13, seen);
    assertEquals("World 0", page.entries().getFirst().world());
    assertEquals(
        0, CaptureHistory.list(directory, page.entries().getLast().id(), 4).entries().size());
    assertThrows(
        IllegalArgumentException.class, () -> CaptureHistory.list(directory, "../outside", 4));
    assertThrows(IllegalArgumentException.class, () -> CaptureHistory.list(directory, null, 101));
    assertThrows(IllegalArgumentException.class, () -> CaptureHistory.list(directory, null, 0));
  }

  @Test
  void unreadableMetadataKeepsTheModelVisibleButPreventsMisleadingUpload() throws IOException {
    Path file = save(TIME, "model", "World");
    Files.writeString(file.resolveSibling("capture.json"), "[1]");
    var entry = CaptureHistory.list(directory, null, 4).entries().getFirst();
    assertFalse(entry.readable());
    assertEquals("Métadonnées illisibles", entry.world());
    assertThrows(IOException.class, () -> CaptureHistory.metadata(file));
    Files.write(file.resolveSibling("capture.json"), new byte[] {(byte) 0xc3, 0x28});
    assertThrows(IOException.class, () -> CaptureHistory.metadata(file));
    Files.writeString(
        file.resolveSibling("capture.json"), "x".repeat(CaptureHistory.MAX_METADATA_BYTES + 1));
    assertThrows(IOException.class, () -> CaptureHistory.metadata(file));
    assertThrows(
        IOException.class,
        () ->
            CaptureHistory.save(
                directory,
                TIME,
                "é".repeat(CaptureHistory.MAX_METADATA_BYTES),
                ignored -> fail("Oversized metadata must fail before export")));
    assertEquals("model", Files.readString(file));
  }

  @Test
  void listingAndLatestReferenceDoNotFollowSymlinksOrPathTraversal() throws IOException {
    Path file = save(TIME, "model", "World");
    Path outside = Files.createTempDirectory(directory, "outside-");
    Files.writeString(outside.resolve("capture.glb"), "private");
    String fakeId = "capture-20261012T123458123Z-00000000-0000-0000-0000-000000000000";
    Files.createSymbolicLink(directory.resolve("history").resolve(fakeId), outside);
    assertEquals(1, CaptureHistory.list(directory, null, 4).entries().size());
    Files.writeString(directory.resolve(".minemories-latest"), "../outside");
    assertThrows(IOException.class, () -> CaptureHistory.latest(directory));
    Files.writeString(directory.resolve(".minemories-latest"), fakeId);
    assertThrows(IOException.class, () -> CaptureHistory.latest(directory));
    Files.delete(file.resolveSibling("capture.json"));
    Files.createSymbolicLink(file.resolveSibling("capture.json"), outside.resolve("capture.glb"));
    assertThrows(IOException.class, () -> CaptureHistory.metadata(file));
  }

  @Test
  void firstFailurePreservesTheOldExportAndCorruptSidecarForManualRecovery() throws IOException {
    Files.writeString(directory.resolve("capture.glb"), "old model");
    Files.writeString(directory.resolve("capture.json"), "broken json");
    assertThrows(
        IOException.class,
        () ->
            CaptureHistory.save(
                directory,
                TIME,
                "{}",
                ignored -> {
                  throw new IOException("export failed");
                }));
    var entry = CaptureHistory.list(directory, null, 4).entries().getFirst();
    assertEquals("old model", Files.readString(entry.file()));
    assertEquals("broken json", Files.readString(entry.file().resolveSibling("capture.json")));
    assertFalse(entry.readable());
    assertEquals("old model", Files.readString(directory.resolve("capture.glb")));
  }

  @Test
  void filesystemProblemsAndInvalidDatesDoNotDestroyCompletedCaptures() throws IOException {
    Path file = save(TIME, "model", "World");
    Files.delete(directory.resolve("capture.json"));
    Files.createDirectory(directory.resolve("capture.json"));
    assertThrows(IOException.class, () -> save(TIME.plusSeconds(10), "new model", "New world"));
    assertEquals(file, CaptureHistory.latest(directory));
    assertEquals("model", Files.readString(directory.resolve("capture.glb")));
    assertEquals(2, CaptureHistory.list(directory, null, 4).entries().size());
    assertThrows(
        IOException.class,
        () ->
            CaptureHistory.save(
                directory,
                Instant.parse("+12026-10-12T00:00:00Z"),
                "{}",
                ignored -> fail("Invalid date must not start writing")));
  }

  @Test
  void labelsAreBoundedAndCannotInjectFormattingCodes() throws IOException {
    Path file =
        CaptureHistory.save(
            directory,
            TIME,
            "{\"worldName\":\"§c" + "a".repeat(300) + "\"}",
            path -> Files.writeString(path, "model", StandardCharsets.UTF_8));
    var entry = CaptureHistory.list(directory, null, 4).entries().getFirst();
    assertEquals(file, entry.file());
    assertEquals(160, entry.world().length());
    assertFalse(entry.world().contains("§"));
    assertThrows(
        UnsupportedOperationException.class,
        () -> CaptureHistory.list(directory, null, 4).entries().clear());
  }
}
