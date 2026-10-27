package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class TiledGlbSceneTest {
  private static final byte[] ONE_PIXEL_PNG =
      Base64.getDecoder()
          .decode(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/HxoAAAAASUVORK5CYII=");
  private static final float[] UV = {0, 0, 1, 0, 1, 1, 0, 1};
  private static final int[][] WORLD_SQUARES = {{20, 64, 20}, {150, 70, 30}, {-200, 60, -300}};

  @TempDir Path tempDir;

  @Test
  void splitsQuadsIntoWorldAnchoredTilesInManifestOrder() throws IOException {
    TiledGlbScene scene = new TiledGlbScene(TileGrid.defaults(), 0, 0, 0);
    addSquare(scene, "far", "far", 200, 64, 10);
    addSquare(scene, "near", "near", 10, 64, 10);
    assertTrue(scene.hasGeometry());
    assertEquals(2, scene.tileCount());

    Path directory = tempDir.resolve("tiles");
    TileManifest manifest = scene.write(directory);

    assertEquals(2, manifest.tiles().size());
    TileManifest.Entry first = manifest.tiles().get(0);
    TileManifest.Entry second = manifest.tiles().get(1);
    assertEquals("x0_z0.glb", first.file());
    assertEquals("x1_z0.glb", second.file());
    assertEquals(1, second.x());
    assertEquals(0, second.z());
    String firstJson = json(Files.readAllBytes(directory.resolve(first.file())));
    assertTrue(firstJson.contains("\"min\":[10.0,64.0,10.0],\"max\":[11.0,65.0,10.0]"));
    String secondJson = json(Files.readAllBytes(directory.resolve(second.file())));
    assertTrue(secondJson.contains("\"min\":[72.0,64.0,10.0],\"max\":[73.0,65.0,10.0]"));
  }

  @Test
  void namesNegativeTilesWithMinusSign() throws IOException {
    TiledGlbScene scene = new TiledGlbScene(TileGrid.defaults(), 0, 0, 0);
    addSquare(scene, "west", "west", -10, 64, 10);
    TileManifest manifest = scene.write(tempDir.resolve("tiles"));

    assertEquals("x-1_z0.glb", manifest.tiles().get(0).file());
    assertEquals(-1, manifest.tiles().get(0).x());
    String json = json(Files.readAllBytes(tempDir.resolve("tiles/x-1_z0.glb")));
    assertTrue(json.contains("\"min\":[118.0,64.0,10.0],\"max\":[119.0,65.0,10.0]"));
  }

  @Test
  void tileBytesDoNotDependOnCaptureOrigin() throws IOException {
    TileManifest first = captureWorld(tempDir.resolve("a"), 10, 64, 10, new int[] {0, 1, 2});
    TileManifest second = captureWorld(tempDir.resolve("b"), -300, 0, 77, new int[] {0, 1, 2});

    assertEquals(first.tiles().size(), second.tiles().size());
    for (int i = 0; i < first.tiles().size(); i++) {
      TileManifest.Entry a = first.tiles().get(i);
      TileManifest.Entry b = second.tiles().get(i);
      assertEquals(a.file(), b.file());
      assertEquals(a.sha256(), b.sha256());
      assertArrayEquals(
          Files.readAllBytes(tempDir.resolve("a").resolve(a.file())),
          Files.readAllBytes(tempDir.resolve("b").resolve(b.file())));
    }
  }

  @Test
  void insertionOrderDoesNotChangeTileBytes() throws IOException {
    TileManifest forward = captureWorld(tempDir.resolve("forward"), 0, 0, 0, new int[] {0, 1, 2});
    TileManifest reversed = captureWorld(tempDir.resolve("reversed"), 0, 0, 0, new int[] {2, 1, 0});

    assertEquals(forward.toJson(), reversed.toJson());
    for (TileManifest.Entry entry : forward.tiles()) {
      assertArrayEquals(
          Files.readAllBytes(tempDir.resolve("forward").resolve(entry.file())),
          Files.readAllBytes(tempDir.resolve("reversed").resolve(entry.file())));
    }
  }

  @Test
  void textureInNeighbouringTileDoesNotChangeTileBytes() throws IOException {
    TiledGlbScene first = new TiledGlbScene(TileGrid.defaults(), 0, 0, 0);
    addSquare(first, "a", "stone", 10, 64, 10);
    addSquare(first, "b", "stone", 200, 64, 10);
    first.write(tempDir.resolve("first"));

    TiledGlbScene second = new TiledGlbScene(TileGrid.defaults(), 0, 0, 0);
    addSquare(second, "a", "stone", 10, 64, 10);
    addSquare(second, "b", "other", 200, 64, 10);
    second.write(tempDir.resolve("second"));

    assertArrayEquals(
        Files.readAllBytes(tempDir.resolve("first/x0_z0.glb")),
        Files.readAllBytes(tempDir.resolve("second/x0_z0.glb")));
    assertFalse(
        Arrays.equals(
            Files.readAllBytes(tempDir.resolve("first/x1_z0.glb")),
            Files.readAllBytes(tempDir.resolve("second/x1_z0.glb"))));
  }

  @Test
  void dropsNonFiniteGeometryAndRejectsWrongArrayLengths() {
    TiledGlbScene scene = new TiledGlbScene(TileGrid.defaults(), 0, 0, 0);
    scene.addQuad(
        "nan-position",
        "name",
        "sprite",
        ONE_PIXEL_PNG,
        0,
        0,
        0,
        1,
        new float[] {Float.NaN, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0},
        UV);
    scene.addQuad(
        "infinite-uv",
        "name",
        "sprite",
        ONE_PIXEL_PNG,
        0,
        0,
        0,
        1,
        new float[] {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0},
        new float[] {0, 0, Float.POSITIVE_INFINITY, 0, 1, 1, 0, 1});
    assertFalse(scene.hasGeometry());
    assertEquals(0, scene.tileCount());

    assertThrows(
        IllegalArgumentException.class,
        () ->
            scene.addQuad(
                "short", "name", "sprite", ONE_PIXEL_PNG, 0, 0, 0, 1, new float[11], new float[8]));
    assertThrows(
        IllegalArgumentException.class,
        () ->
            scene.addQuad(
                "uv", "name", "sprite", ONE_PIXEL_PNG, 0, 0, 0, 1, new float[12], new float[7]));
  }

  @Test
  void emptyAndLightOnlyScenesFailWithoutCreatingDirectory() {
    Path directory = tempDir.resolve("empty");
    TiledGlbScene scene = new TiledGlbScene(TileGrid.defaults(), 0, 0, 0);
    assertThrows(IOException.class, () -> scene.write(directory));
    scene.addPointLight(10.5f, 65, 10.5f, 0xFFFFFF, 15);
    assertFalse(scene.hasGeometry());
    assertThrows(IOException.class, () -> scene.write(directory));
    assertFalse(Files.exists(directory));
  }

  @Test
  void manifestDescribesCumulativeOffsetsSizesAndDigests() throws Exception {
    TiledGlbScene scene = new TiledGlbScene(TileGrid.defaults(), 0, 0, 0);
    addSquare(scene, "a", "stone", 10, 64, 10);
    addSquare(scene, "b", "stone", 20, 64, 20);
    addSquare(scene, "c", "stone", 200, 64, 10);
    addSquare(scene, "d", "stone", 10, 64, 200);
    Path directory = tempDir.resolve("tiles");
    TileManifest manifest = scene.write(directory);

    List<TileManifest.Entry> tiles = manifest.tiles();
    assertEquals(3, tiles.size());
    assertEquals("x0_z0.glb", tiles.get(0).file());
    assertEquals("x0_z1.glb", tiles.get(1).file());
    assertEquals("x1_z0.glb", tiles.get(2).file());
    assertEquals(2, tiles.get(0).quads());
    assertEquals(1, tiles.get(1).quads());
    assertEquals(1, tiles.get(2).quads());
    long offset = 0;
    for (TileManifest.Entry tile : tiles) {
      byte[] bytes = Files.readAllBytes(directory.resolve(tile.file()));
      assertEquals(offset, tile.offset());
      assertEquals(bytes.length, tile.size());
      assertEquals(
          HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)),
          tile.sha256());
      offset += bytes.length;
    }
    assertEquals(offset, manifest.dataBytes());
  }

  @Test
  void everyTileIsAValidSelfContainedGlb() throws IOException {
    TiledGlbScene scene = new TiledGlbScene(TileGrid.defaults(), 0, 0, 0);
    addSquare(scene, "a", "stone", 10, 64, 10);
    addSquare(scene, "b", "stone", 200, 64, 10);
    scene.addQuad(
        "odd",
        "odd",
        "odd",
        ONE_PIXEL_PNG,
        0xFFFFFF,
        0,
        Float.NaN,
        Float.POSITIVE_INFINITY,
        new float[] {300, 64, 10, 301, 64, 10, 301, 65, 10, 300, 65, 10},
        UV);
    Path directory = tempDir.resolve("tiles");
    TileManifest manifest = scene.write(directory);

    for (TileManifest.Entry tile : manifest.tiles()) {
      byte[] glb = Files.readAllBytes(directory.resolve(tile.file()));
      ByteBuffer header = ByteBuffer.wrap(glb).order(ByteOrder.LITTLE_ENDIAN);
      assertEquals(0x46546C67, header.getInt(0));
      assertEquals(2, header.getInt(4));
      assertEquals(glb.length, header.getInt(8));
      assertEquals(0, glb.length % 4);
      String json = json(glb);
      assertFalse(json.contains("NaN"));
      assertFalse(json.contains("Infinity"));
    }
    String oddJson = json(Files.readAllBytes(directory.resolve("x2_z0.glb")));
    assertTrue(oddJson.contains("\"baseColorFactor\":[1.0,1.0,1.0,1.0]"));
    assertFalse(oddJson.contains("emissiveFactor"));
  }

  @Test
  void lightsAreRoutedOnlyIntoTilesThatKeepQuads() throws IOException {
    TiledGlbScene scene = new TiledGlbScene(TileGrid.defaults(), 0, 0, 0);
    addSquare(scene, "a", "stone", 10, 64, 10);
    scene.addPointLight(10.5f, 65, 10.5f, 0xFFD080, 14);
    scene.addPointLight(200.5f, 65, 10.5f, 0xFFD080, 14);
    scene.addPointLight(10.5f, 65, 10.5f, 0xFFD080, 3);
    scene.addPointLight(Float.NaN, 65, 10.5f, 0xFFD080, 14);
    TileManifest manifest = scene.write(tempDir.resolve("lit"));

    assertEquals(1, manifest.tiles().size());
    String json = json(Files.readAllBytes(tempDir.resolve("lit/x0_z0.glb")));
    assertTrue(json.contains("KHR_lights_punctual"));
    assertEquals(1, count(json, "\"type\":\"point\""));

    TiledGlbScene quadOnly = new TiledGlbScene(TileGrid.defaults(), 0, 0, 0);
    addSquare(quadOnly, "a", "stone", 10, 64, 10);
    quadOnly.addPointLight(10.5f, 65, 10.5f, 0xFFD080, 3);
    quadOnly.write(tempDir.resolve("dim"));
    String dim = json(Files.readAllBytes(tempDir.resolve("dim/x0_z0.glb")));
    assertFalse(dim.contains("KHR_lights_punctual"));
  }

  @Test
  void quadCentroidDecidesTileAndVerticesKeepExactLocalCoordinates() throws IOException {
    TiledGlbScene scene = new TiledGlbScene(TileGrid.defaults(), 0, 0, 0);
    scene.addQuad(
        "straddle",
        "straddle",
        "stone",
        ONE_PIXEL_PNG,
        0xFFFFFF,
        0,
        0,
        1,
        new float[] {100, 0, 0, 200, 0, 0, 200, 1, 0, 100, 1, 0},
        UV);
    TileManifest manifest = scene.write(tempDir.resolve("straddle"));

    assertEquals(1, manifest.tiles().size());
    assertEquals("x1_z0.glb", manifest.tiles().get(0).file());
    String json = json(Files.readAllBytes(tempDir.resolve("straddle/x1_z0.glb")));
    assertTrue(json.contains("\"min\":[-28.0,0.0,0.0],\"max\":[72.0,1.0,0.0]"));
  }

  @Test
  void quadWithCentroidOutsideSupportedRangeIsDropped() {
    TiledGlbScene scene = new TiledGlbScene(TileGrid.defaults(), 0, 0, 0);
    scene.addQuad(
        "far",
        "far",
        "stone",
        ONE_PIXEL_PNG,
        0xFFFFFF,
        0,
        0,
        1,
        new float[] {1.0e9f, 0, 0, 1.0e9f + 1, 0, 0, 1.0e9f + 1, 1, 0, 1.0e9f, 1, 0},
        UV);
    assertFalse(scene.hasGeometry());
  }

  private static TileManifest captureWorld(
      Path directory, int originX, int originY, int originZ, int[] order) throws IOException {
    TiledGlbScene scene = new TiledGlbScene(TileGrid.defaults(), originX, originY, originZ);
    for (int index : order) {
      int[] square = WORLD_SQUARES[index];
      addSquare(
          scene,
          "square" + index,
          "stone",
          square[0] - originX,
          square[1] - originY,
          square[2] - originZ);
    }
    scene.addPointLight(20.5f - originX, 65.5f - originY, 20.5f - originZ, 0xFFD080, 12);
    return scene.write(directory);
  }

  private static void addSquare(
      TiledGlbScene scene, String key, String imageKey, float x, float y, float z) {
    scene.addQuad(
        key,
        key,
        imageKey,
        ONE_PIXEL_PNG,
        0xFFFFFF,
        0,
        0,
        1,
        new float[] {x, y, z, x + 1, y, z, x + 1, y + 1, z, x, y + 1, z},
        UV);
  }

  private static String json(byte[] glb) {
    int length = ByteBuffer.wrap(glb).order(ByteOrder.LITTLE_ENDIAN).getInt(12);
    return new String(glb, 20, length, StandardCharsets.UTF_8);
  }

  private static long count(String text, String needle) {
    return Stream.iterate(text.indexOf(needle), i -> i >= 0, i -> text.indexOf(needle, i + 1))
        .count();
  }
}
