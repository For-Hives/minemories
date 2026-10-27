package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.JsonObject;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class CaptureIdentityTest {
  @Test
  void worldKeysAreStableScopedAndDoNotExposeNamesOrAmbiguousConcatenations() {
    String id = CaptureIdentity.world("solo:/private/world", "42", "overworld", "player");
    assertEquals(id, CaptureIdentity.world("solo:/private/world", "42", "overworld", "player"));
    assertTrue(id.matches("[a-f0-9]{64}"));
    assertFalse(id.contains("private"));
    assertNotEquals(id, CaptureIdentity.world("solo:/other/world", "42", "overworld", "player"));
    assertNotEquals(id, CaptureIdentity.world("solo:/private/world", "43", "overworld", "player"));
    assertNotEquals(id, CaptureIdentity.world("solo:/private/world", "42", "nether", "player"));
    assertNotEquals(
        id, CaptureIdentity.world("solo:/private/world", "42", "overworld", "other-player"));
    assertNotEquals(
        CaptureIdentity.world("ab", "c", "d", "e"), CaptureIdentity.world("a", "bc", "d", "e"));
    assertNotEquals(
        CaptureIdentity.world("server:address", null, "d", "e"),
        CaptureIdentity.world("server:address", "", "d", "e"));
    assertThrows(
        IllegalArgumentException.class,
        () -> CaptureIdentity.world("x".repeat(16385), null, "d", "e"));
  }

  @Test
  void automaticFootprintsAllowGrowingDepthButSelectionsKeepEveryCorner() {
    var shallow = new CaptureBounds(-8, 60, -8, 8, 319, 8);
    var deep = new CaptureBounds(-8, 20, -8, 8, 319, 8);
    String around = CaptureIdentity.zone("world", shallow, false);
    assertEquals(around, CaptureIdentity.zone("world", deep, false));
    assertNotEquals(around, CaptureIdentity.zone("world", shallow, true));
    assertNotEquals(around, CaptureIdentity.zone("other-world", shallow, false));
    assertNotEquals(
        around, CaptureIdentity.zone("world", new CaptureBounds(-7, 60, -8, 9, 319, 8), false));
    assertNotEquals(
        CaptureIdentity.zone("world", shallow, true), CaptureIdentity.zone("world", deep, true));
  }

  @Test
  void exactOriginTracksTheFinalVolumeWithoutOverflowOrRoundingNegativeCoordinatesDown() {
    var metadata = new JsonObject();
    CaptureIdentity.geometry(metadata, new CaptureBounds(-2, -64, -2, 2, 319, 2));
    assertEquals(127, metadata.getAsJsonObject("captureOrigin").get("y").getAsInt());
    assertEquals(-64, metadata.getAsJsonObject("captureBounds").get("minY").getAsInt());
    CaptureIdentity.geometry(metadata, new CaptureBounds(-2, -3, -2, -1, -2, -1));
    assertEquals(-1, metadata.getAsJsonObject("captureOrigin").get("x").getAsInt());
    CaptureIdentity.geometry(
        metadata, new CaptureBounds(Integer.MAX_VALUE - 2, 0, 0, Integer.MAX_VALUE, 2, 2));
    assertEquals(
        Integer.MAX_VALUE - 1, metadata.getAsJsonObject("captureOrigin").get("x").getAsInt());
  }

  @Test
  void legacyExplorationHistoryDeepensTheVolumeWithoutChangingTheZone(@TempDir Path directory)
      throws IOException {
    // History written before zones existed: only chunk -> lowest feet Y, no ".zones" sibling.
    Path legacy = directory.resolve("legacy.properties");
    Files.writeString(legacy, "0=64\n-4294967296=12\nnot-a-chunk=3\n");
    var history = ExplorationDepth.read(legacy);
    assertTrue(
        VisitedZones.read(directory.resolve("legacy.properties.zones")).suggestions().isEmpty());

    int bottom = history.captureBottom(-8, 8, -8, 8, 70, -64);
    assertEquals(7, bottom);
    var shallow = new CaptureBounds(-8, 65, -8, 8, 319, 8);
    var explored = new CaptureBounds(-8, bottom, -8, 8, 319, 8);
    String id = CaptureIdentity.world("solo:/old/world", "42", "overworld", "player");
    String zone = CaptureIdentity.zone(id, shallow, false);
    assertEquals(zone, CaptureIdentity.zone(id, explored, false));

    var metadata = new JsonObject();
    CaptureIdentity.geometry(metadata, explored);
    assertEquals(Set.of("captureBounds", "captureOrigin"), metadata.keySet());
  }
}
