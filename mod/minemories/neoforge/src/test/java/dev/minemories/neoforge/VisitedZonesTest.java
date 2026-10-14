package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class VisitedZonesTest {
  @TempDir Path directory;

  private static void visit(VisitedZones zones, int x, int z, int seconds) {
    zones.sample(x, z, 1000, true, true);
    for (int i = 1; i <= seconds; i++) zones.sample(x, z, 1000L + i * 1000L, true, true);
  }

  @Test
  void aggregatesRanksAndHandlesNegativeCoordinates() {
    var zones = new VisitedZones();
    visit(zones, -1, -1, 60);
    visit(zones, -64, -64, 60);
    visit(zones, 0, 0, 90);
    visit(zones, 63, 63, 30);
    visit(zones, 64, 64, 59);
    assertEquals(2, zones.suggestions().size());
    assertEquals(new VisitedZones.Zone(-64, -64, 120), zones.suggestions().getFirst());
    assertEquals(new VisitedZones.Zone(0, 0, 120), zones.suggestions().get(1));
    assertTrue(zones.suggestions().getFirst().label().contains("2 min"));
  }

  @Test
  void pauseAbsentChunksAndClockGapsNeverAccumulateTime() {
    var zones = new VisitedZones();
    zones.sample(0, 0, 1000, true, true);
    for (int i = 2; i < 200; i++) zones.sample(0, 0, i * 1000L, false, true);
    for (int i = 200; i < 400; i++) zones.sample(0, 0, i * 1000L, true, false);
    zones.sample(0, 0, 4_000_000, true, true);
    zones.sample(0, 0, -100, true, true);
    assertTrue(zones.suggestions().isEmpty());
    visit(zones, 0, 0, 60);
    assertEquals(60, zones.suggestions().getFirst().seconds());
  }

  @Test
  void clientTicksAndRenderChecksDoNotStarveTheOneSecondCounter() {
    var zones = new VisitedZones();
    for (int i = 0; i <= 1400; i++) zones.sample(0, 0, 1000L + i * 50L, true, true);
    assertEquals(70, zones.suggestions().getFirst().seconds());
    for (int i = 1401; i <= 2800; i++) zones.sample(0, 0, 1000L + i * 50L, false, true);
    assertEquals(70, zones.suggestions().getFirst().seconds());
  }

  @Test
  void persistenceRetainsScoresButNeverReplaysOfflineTime() throws IOException {
    Path file = directory.resolve("zones");
    var zones = VisitedZones.read(file);
    zones.save(file);
    assertFalse(Files.exists(file));
    visit(zones, 0, 0, 90);
    zones.save(file);
    Files.writeString(file, Files.readString(file) + "\nbroken=x\n42=-9\n43=999999999999\n");
    var restored = VisitedZones.read(file);
    restored.sample(0, 0, 9_000_000, true, true);
    assertEquals(zones.suggestions(), restored.suggestions());
    assertTrue(VisitedZones.read(directory.resolve("other-world")).suggestions().isEmpty());
  }

  @Test
  void boundsHistoryAndSuggestionsAndRejectsUnsafeFiles() throws IOException {
    var zones = new VisitedZones();
    for (int i = 0; i <= VisitedZones.MAX_ZONES; i++) visit(zones, i * 64, 0, 60);
    assertEquals(5, zones.suggestions().size());
    assertEquals(64, zones.suggestions().getFirst().minX());
    Path file = directory.resolve("bounded");
    zones.save(file);
    assertTrue(Files.size(file) < 1024 * 1024);
    assertEquals(zones.suggestions(), VisitedZones.read(file).suggestions());
    Path link = directory.resolve("link");
    Files.createSymbolicLink(link, file);
    assertThrows(IOException.class, () -> VisitedZones.read(link));
    Path large = directory.resolve("large");
    Files.write(large, new byte[1024 * 1024 + 1]);
    assertThrows(IOException.class, () -> VisitedZones.read(large));
  }
}
