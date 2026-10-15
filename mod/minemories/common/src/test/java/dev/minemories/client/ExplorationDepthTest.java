package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ExplorationDepthTest {
  @TempDir Path directory;

  @Test
  void firstCaptureKeepsFoundationsButDoesNotExposeUnvisitedDeepCaves() {
    var history = new ExplorationDepth();
    assertEquals(62, history.captureBottom(-8, 8, -8, 8, 64, -64));
    history.record(0, 64, 0);
    history.record(0, 90, 0);
    assertEquals(62, history.captureBottom(-8, 8, -8, 8, 90, -64));
    history.record(0, 20, 0);
    assertEquals(18, history.captureBottom(-8, 8, -8, 8, 64, -64));
  }

  @Test
  void negativeCoordinatesAndOtherChunksDoNotLeakDepthBetweenZones() {
    var history = new ExplorationDepth();
    history.record(-1, -30, -1);
    assertEquals(62, history.captureBottom(0, 8, 0, 8, 64, -64));
    assertEquals(-32, history.captureBottom(-8, 8, -8, 8, 64, -64));
    history.record(5000, -60, 5000);
    assertEquals(-32, history.captureBottom(-8, 8, -8, 8, 64, -64));
  }

  @Test
  void identitiesAreIsolatedAndDoNotExposeServerNames() {
    Path base =
        ExplorationDepth.historyPath(directory, "server:private.example", "overworld", "player");
    assertNotEquals(
        base,
        ExplorationDepth.historyPath(directory, "server:other.example", "overworld", "player"));
    assertNotEquals(
        base,
        ExplorationDepth.historyPath(directory, "server:private.example", "nether", "player"));
    assertNotEquals(
        base,
        ExplorationDepth.historyPath(directory, "server:private.example", "overworld", "other"));
    assertNotEquals(
        ExplorationDepth.historyPath(directory, "a", "bc", "d"),
        ExplorationDepth.historyPath(directory, "ab", "c", "d"));
    assertFalse(base.getFileName().toString().contains("private"));
  }

  @Test
  void persistenceRecoversValidEntriesAndIgnoresMalformedOnes() throws IOException {
    Path file = directory.resolve("history.properties");
    var history = ExplorationDepth.read(file);
    history.save(file);
    assertFalse(Files.exists(file));
    history.record(0, 16, 0);
    history.save(file);
    Files.writeString(file, Files.readString(file) + "\nbroken=oops\n123=bad\n");
    var restored = ExplorationDepth.read(file);
    assertEquals(14, restored.captureBottom(-8, 8, -8, 8, 64, -64));
    restored.record(0, 8, 0);
    restored.save(file);
    assertEquals(6, ExplorationDepth.read(file).captureBottom(-8, 8, -8, 8, 64, -64));
  }

  @Test
  void invalidAndExtremeBoundsStaySafe() throws IOException {
    var history = new ExplorationDepth();
    history.record(0, Integer.MIN_VALUE, 0);
    assertEquals(-64, history.captureBottom(-8, 8, -8, 8, 64, -64));
    assertThrows(IllegalArgumentException.class, () -> history.captureBottom(8, -8, 0, 8, 64, -64));
    assertThrows(
        IllegalArgumentException.class, () -> history.captureBottom(0, 10000, 0, 8, 64, -64));
    Path file = directory.resolve("oversized.properties");
    try (var channel =
        java.nio.channels.FileChannel.open(
            file,
            java.nio.file.StandardOpenOption.CREATE,
            java.nio.file.StandardOpenOption.WRITE)) {
      channel.position(8 * 1024 * 1024);
      channel.write(java.nio.ByteBuffer.wrap(new byte[] {0}));
    }
    assertThrows(IOException.class, () -> ExplorationDepth.read(file));
  }

  @Test
  void historyStaysBoundedAfterLongExploration() throws IOException {
    var history = new ExplorationDepth();
    for (int i = 0; i <= 100_000; i++) history.record(i * 16, 10, 0);
    assertEquals(62, history.captureBottom(0, 8, 0, 8, 64, -64));
    assertEquals(8, history.captureBottom(1_600_000, 1_600_008, 0, 8, 64, -64));
    Path file = directory.resolve("bounded.properties");
    history.save(file);
    assertTrue(Files.size(file) < 8 * 1024 * 1024);
    assertEquals(8, ExplorationDepth.read(file).captureBottom(1_600_000, 1_600_008, 0, 8, 64, -64));
  }
}
