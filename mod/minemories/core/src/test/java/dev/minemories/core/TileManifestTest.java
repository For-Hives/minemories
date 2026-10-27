package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

final class TileManifestTest {
  private static final String SHA = "a".repeat(64);

  @Test
  void serializesExactDeterministicJson() {
    TileManifest manifest =
        new TileManifest(
            TileManifest.FORMAT,
            8,
            List.of(new TileManifest.Entry(-1, 0, "x-1_z0.glb", 0, 123, SHA, 42)));
    assertEquals(
        "{\"format\":\"minemories-tiles-v1\",\"tileChunks\":8,\"tiles\":[{\"x\":-1,\"z\":0,\"file\":\"x-1_z0.glb\",\"offset\":0,\"size\":123,\"sha256\":\""
            + SHA
            + "\",\"quads\":42}]}",
        manifest.toJson());
  }

  @Test
  void serializesEmptyTileListAndEscapesStrings() {
    assertEquals(
        "{\"format\":\"minemories-tiles-v1\",\"tileChunks\":1,\"tiles\":[]}",
        new TileManifest(TileManifest.FORMAT, 1, List.of()).toJson());
    TileManifest escaped =
        new TileManifest(
            TileManifest.FORMAT,
            1,
            List.of(new TileManifest.Entry(0, 0, "a\\\"b.glb", 0, 1, SHA, 1)));
    assertTrue(escaped.toJson().contains("\"file\":\"a\\\\\\\"b.glb\""));
  }

  @Test
  void validatesFormatAndTileChunks() {
    assertThrows(IllegalArgumentException.class, () -> new TileManifest("other", 8, List.of()));
    assertThrows(
        IllegalArgumentException.class, () -> new TileManifest(TileManifest.FORMAT, 0, List.of()));
    assertThrows(
        IllegalArgumentException.class, () -> new TileManifest(TileManifest.FORMAT, 17, List.of()));
  }

  @Test
  void namesTilesWithSignedIndices() {
    assertEquals("x-1_z0.glb", TileManifest.fileName(-1, 0));
    assertEquals("x3_z-12.glb", TileManifest.fileName(3, -12));
  }

  @Test
  void sumsEntrySizesAndKeepsTilesImmutable() {
    List<TileManifest.Entry> source = new ArrayList<>();
    source.add(new TileManifest.Entry(0, 0, "x0_z0.glb", 0, 100, SHA, 1));
    source.add(new TileManifest.Entry(1, 0, "x1_z0.glb", 100, 25, SHA, 2));
    TileManifest manifest = new TileManifest(TileManifest.FORMAT, 8, source);
    source.clear();
    assertEquals(2, manifest.tiles().size());
    assertEquals(125, manifest.dataBytes());
    assertThrows(
        UnsupportedOperationException.class,
        () -> manifest.tiles().add(new TileManifest.Entry(2, 0, "x2_z0.glb", 125, 1, SHA, 1)));
  }
}
