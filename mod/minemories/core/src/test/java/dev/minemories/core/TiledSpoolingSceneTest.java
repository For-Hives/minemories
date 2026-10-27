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
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class TiledSpoolingSceneTest {
  private static final byte[] ONE_PIXEL_PNG =
      Base64.getDecoder()
          .decode(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/HxoAAAAASUVORK5CYII=");
  private static final float[] UV = {0, 0, 1, 0, 1, 1, 0, 1};
  private static final int[][] WORLD_SQUARES = {{20, 64, 20}, {150, 70, 30}, {-200, 60, -300}};
  private static final Pattern ENTRY =
      Pattern.compile(
          "\\{\"x\":(-?\\d+),\"z\":(-?\\d+),\"file\":\"([^\"]+)\",\"offset\":(\\d+),\"size\":(\\d+),"
              + "\"sha256\":\"([0-9a-f]{64})\",\"quads\":(\\d+)\\}");

  @TempDir Path tempDir;

  @Test
  void bundleCarriesManifestMatchingEveryTileGlb() throws Exception {
    TiledSpoolingScene scene = scene();
    scene.setOrigin(0, 0, 0);
    addSquare(scene, "far", "far", 200, 64, 10);
    addSquare(scene, "near", "near", 10, 64, 10);
    Path output = tempDir.resolve("out/capture.mmtiles");
    scene.write(output);

    Bundle bundle = Bundle.read(output);
    assertTrue(
        bundle
            .manifest()
            .startsWith("{\"format\":\"minemories-tiles-v1\",\"tileChunks\":8,\"tiles\":["));
    List<TileManifest.Entry> entries = bundle.entries();
    assertEquals(2, entries.size());
    assertEquals(0, entries.get(0).x());
    assertEquals("x0_z0.glb", entries.get(0).file());
    assertEquals(0, entries.get(0).offset());
    assertEquals(1, entries.get(0).quads());
    assertEquals(entries.get(0).size(), entries.get(1).offset());
    assertEquals(1, entries.get(1).x());
    assertEquals("x1_z0.glb", entries.get(1).file());
    assertEquals(1, entries.get(1).quads());
    long dataBytes = entries.get(0).size() + entries.get(1).size();
    assertEquals(bundle.dataStart() + dataBytes, bundle.bytes().length);
    for (int i = 0; i < entries.size(); i++) {
      byte[] glb = bundle.tile(i);
      assertEquals(
          HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(glb)),
          entries.get(i).sha256());
      assertValidGlb(glb);
    }
    scene.close();
  }

  @Test
  void sameBlocksWithDifferentOriginsGiveIdenticalTilePayloads() throws IOException {
    Bundle first = captureWorld(tempDir.resolve("a"), 10, 64, 10);
    Bundle second = captureWorld(tempDir.resolve("b"), -300, 0, 77);

    assertEquals(first.entries(), second.entries());
    assertEquals(3, first.entries().size());
    for (int i = 0; i < first.entries().size(); i++) {
      assertArrayEquals(first.tile(i), second.tile(i));
    }
  }

  @Test
  void namesNegativeTilesWithMinusSign() throws IOException {
    TiledSpoolingScene scene = scene();
    scene.setOrigin(0, 0, 0);
    addSquare(scene, "west", "west", -10, 64, 10);
    Path output = tempDir.resolve("west.mmtiles");
    scene.write(output);

    TileManifest.Entry entry = Bundle.read(output).entries().get(0);
    assertEquals(-1, entry.x());
    assertEquals(0, entry.z());
    assertEquals("x-1_z0.glb", entry.file());
    scene.close();
  }

  @Test
  void routesLightsOnlyIntoTilesThatHoldQuadsAndDropsOthers() throws Exception {
    TiledSpoolingScene scene = scene();
    scene.setOrigin(0, 0, 0);
    addSquare(scene, "a", "stone", 10, 64, 10);
    addSquare(scene, "b", "stone", 200, 64, 10);
    scene.addPointLight(10.5f, 65, 10.5f, 0xFFD080, 14);
    scene.addPointLight(200.5f, 65, 10.5f, 0xFFD080, 14);
    scene.addPointLight(300.5f, 65, 10.5f, 0xFFD080, 14);
    Path output = tempDir.resolve("lit.mmtiles");
    scene.write(output);

    Bundle bundle = Bundle.read(output);
    assertEquals(2, bundle.entries().size());
    assertEquals(1, count(json(bundle.tile(0)), "\"type\":\"point\""));
    assertEquals(1, count(json(bundle.tile(1)), "\"type\":\"point\""));
    scene.close();
  }

  @Test
  void dropsLightsBelowLevelFourAndNonFiniteLights() throws Exception {
    TiledSpoolingScene scene = scene();
    scene.setOrigin(0, 0, 0);
    addSquare(scene, "a", "stone", 10, 64, 10);
    scene.addPointLight(10.5f, 65, 10.5f, 0xFFD080, 3);
    scene.addPointLight(Float.NaN, 65, 10.5f, 0xFFD080, 14);
    scene.addPointLight(10.5f, Float.POSITIVE_INFINITY, 10.5f, 0xFFD080, 14);
    Path output = tempDir.resolve("dim.mmtiles");
    scene.write(output);

    String json = json(Bundle.read(output).tile(0));
    assertFalse(json.contains("KHR_lights_punctual"));
    scene.close();
  }

  @Test
  void capsLightsAtOneHundredTwentyEightPerTile() throws Exception {
    TiledSpoolingScene scene = scene();
    scene.setOrigin(0, 0, 0);
    addSquare(scene, "a", "stone", 10, 64, 10);
    for (int i = 0; i < 130; i++) {
      scene.addPointLight(1 + (i % 64), 65, 1 + (i / 64), 0xFFD080, 14);
    }
    Path output = tempDir.resolve("many.mmtiles");
    scene.write(output);

    assertEquals(128, count(json(Bundle.read(output).tile(0)), "\"type\":\"point\""));
    scene.close();
  }

  @Test
  void geometryBeforeOriginThrows() throws Exception {
    TiledSpoolingScene scene = scene();
    assertThrows(
        IllegalStateException.class,
        () -> scene.addQuad("a", "a", "stone", ONE_PIXEL_PNG, 0, 0, 0, 1, new float[12], UV));
    assertThrows(IllegalStateException.class, () -> scene.addPointLight(1, 65, 1, 0xFFFFFF, 14));
    assertFalse(scene.hasGeometry());
    scene.close();
  }

  @Test
  void originMayChangeBeforeUseButNotAfterwards() throws Exception {
    TiledSpoolingScene scene = scene();
    scene.setOrigin(1, 2, 3);
    scene.setOrigin(4, 5, 6);
    scene.setOrigin(4, 5, 6);
    addSquare(scene, "a", "stone", 10, 64, 10);
    scene.setOrigin(4, 5, 6);
    assertThrows(IllegalStateException.class, () -> scene.setOrigin(0, 0, 0));
    scene.close();
  }

  @Test
  void invalidInputsAreRejectedOrDropped() throws Exception {
    TiledSpoolingScene scene = scene();
    scene.setOrigin(0, 0, 0);
    scene.addQuad(
        "nan",
        "nan",
        "stone",
        ONE_PIXEL_PNG,
        0,
        0,
        0,
        1,
        new float[] {Float.NaN, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0},
        UV);
    scene.addQuad(
        "far",
        "far",
        "stone",
        ONE_PIXEL_PNG,
        0,
        0,
        0,
        1,
        new float[] {1.0e9f, 0, 0, 1.0e9f + 1, 0, 0, 1.0e9f + 1, 1, 0, 1.0e9f, 1, 0},
        UV);
    assertThrows(
        IllegalArgumentException.class,
        () ->
            scene.addQuad("short", "short", "stone", ONE_PIXEL_PNG, 0, 0, 0, 1, new float[11], UV));
    assertFalse(scene.hasGeometry());
    assertEquals(0, scene.quadCount());
    scene.close();
  }

  @Test
  void emptySceneWriteFailsWithoutOutput() throws Exception {
    TiledSpoolingScene scene = scene();
    scene.setOrigin(0, 0, 0);
    scene.addPointLight(10.5f, 65, 10.5f, 0xFFD080, 14);
    Path output = tempDir.resolve("empty.mmtiles");
    IOException failure = assertThrows(IOException.class, () -> scene.write(output));
    assertEquals("The capture contains no renderable geometry.", failure.getMessage());
    assertFalse(Files.exists(output));
    scene.close();
  }

  @Test
  void leavesNoWorkDirectoryAfterSuccess() throws Exception {
    TiledSpoolingScene scene = scene();
    scene.setOrigin(0, 0, 0);
    addSquare(scene, "a", "stone", 10, 64, 10);
    Path output = tempDir.resolve("out/capture.mmtiles");
    scene.write(output);

    assertEquals(List.of("capture.mmtiles"), names(tempDir.resolve("out")));
    assertFalse(names(spool()).stream().anyMatch(name -> name.startsWith(".minemories-tiles-")));
    scene.close();
  }

  @Test
  void leavesNoWorkDirectoryOrTileFilesAfterFailedWrite() throws Exception {
    TiledSpoolingScene scene = scene();
    scene.setOrigin(0, 0, 0);
    addSquare(scene, "a", "stone", 10, 64, 10);
    addSquare(scene, "b", "stone", 200, 64, 10);
    scene.addPointLight(10.5f, 65, 10.5f, 0xFFD080, 14);
    Path output = tempDir.resolve("capture.mmtiles");
    Files.createDirectories(output.resolve("occupied"));
    Files.writeString(output.resolve("occupied/file"), "x");

    assertThrows(IOException.class, () -> scene.write(output));
    assertThrows(IOException.class, () -> scene.write(tempDir.resolve("retry.mmtiles")));

    assertEquals(List.of("capture.mmtiles", "spool"), names(tempDir));
    assertFalse(names(spool()).stream().anyMatch(name -> name.startsWith(".minemories-tiles-")));
    scene.close();
  }

  @Test
  void closeRemovesSpoolDirectoriesAndRejectsFurtherUse() throws Exception {
    TiledSpoolingScene scene = scene();
    scene.setOrigin(0, 0, 0);
    addSquare(scene, "a", "stone", 10, 64, 10);
    addSquare(scene, "b", "stone", 200, 64, 10);
    scene.write(tempDir.resolve("out.mmtiles"));
    scene.close();

    assertEquals(List.of(), names(spool()));
    assertThrows(IllegalStateException.class, () -> addSquare(scene, "c", "stone", 10, 64, 10));
    assertThrows(IOException.class, () -> scene.write(tempDir.resolve("late.mmtiles")));
    assertFalse(scene.hasGeometry());
  }

  @Test
  void failedTileDisablesTheWholeCapture() throws Exception {
    SpoolingGlbScene.Limits oneMaterial =
        new SpoolingGlbScene.Limits(
            1, 1024, 128, 4096, 4 * 1024 * 1024, 256L * 1024 * 1024, 200L * 1024 * 1024, 8);
    TiledSpoolingScene scene = new TiledSpoolingScene(spool(), oneMaterial, TileGrid.defaults());
    scene.setOrigin(0, 0, 0);
    addSquare(scene, "a", "stone", 10, 64, 10);
    assertThrows(IOException.class, () -> addSquare(scene, "b", "dirt", 12, 64, 10));

    assertFalse(scene.hasGeometry());
    assertThrows(IOException.class, () -> scene.write(tempDir.resolve("failed.mmtiles")));
    scene.close();
  }

  @Test
  void reportsMaterialAndQuadCountsAcrossTiles() throws Exception {
    TiledSpoolingScene scene = scene();
    scene.setOrigin(0, 0, 0);
    addSquare(scene, "a", "stone", 10, 64, 10);
    addSquare(scene, "a", "stone", 12, 64, 10);
    addSquare(scene, "b", "stone", 200, 64, 10);

    assertTrue(scene.hasGeometry());
    assertEquals(3, scene.quadCount());
    assertEquals(2, scene.materialCount());
    scene.close();
  }

  @Test
  void ignoresPlayerPositionInTiles() throws Exception {
    TiledSpoolingScene scene = scene();
    scene.setOrigin(0, 0, 0);
    addSquare(scene, "a", "stone", 10, 64, 10);
    scene.setPlayerPosition(1.25, 64.5, -3.75);
    Path output = tempDir.resolve("player.mmtiles");
    scene.write(output);

    assertFalse(json(Bundle.read(output).tile(0)).contains("minemoriesPlayerPosition"));
    scene.close();
  }

  @Test
  void singleSpoolSceneIsUsableThroughCaptureSceneInterface() throws Exception {
    Path output = tempDir.resolve("single.glb");
    try (SpoolingGlbScene spool = new SpoolingGlbScene(tempDir.resolve("single-spool"))) {
      CaptureScene capture = spool;
      capture.setOrigin(0, 0, 0);
      SpoolingGlbSceneTest.add(spool, "a");
      SpoolingGlbSceneTest.add(spool, "b");
      capture.setPlayerPosition(1, 2, 3);

      assertTrue(capture.hasGeometry());
      assertEquals(2, capture.quadCount());
      assertEquals(spool.metrics().quads(), capture.quadCount());
      assertEquals(2, capture.materialCount());
      capture.write(output);
      assertValidGlb(Files.readAllBytes(output));
    }
  }

  private TiledSpoolingScene scene() {
    return new TiledSpoolingScene(spool(), SpoolingGlbScene.Limits.defaults(), TileGrid.defaults());
  }

  private Path spool() {
    return tempDir.resolve("spool");
  }

  private Bundle captureWorld(Path directory, int originX, int originY, int originZ)
      throws IOException {
    TiledSpoolingScene scene =
        new TiledSpoolingScene(
            tempDir.resolve(directory.getFileName() + "-spool"),
            SpoolingGlbScene.Limits.defaults(),
            TileGrid.defaults());
    scene.setOrigin(originX, originY, originZ);
    for (int[] square : WORLD_SQUARES) {
      addSquare(
          scene,
          "square" + square[0],
          "stone",
          square[0] - originX,
          square[1] - originY,
          square[2] - originZ);
    }
    scene.addPointLight(20.5f - originX, 65.5f - originY, 20.5f - originZ, 0xFFD080, 12);
    Files.createDirectories(directory);
    Path output = directory.resolve("capture.mmtiles");
    scene.write(output);
    scene.close();
    return Bundle.read(output);
  }

  private static void addSquare(
      TiledSpoolingScene scene, String key, String imageKey, float x, float y, float z)
      throws IOException {
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

  private static void assertValidGlb(byte[] glb) {
    ByteBuffer header = ByteBuffer.wrap(glb).order(ByteOrder.LITTLE_ENDIAN);
    assertEquals(0x46546C67, header.getInt(0));
    assertEquals(2, header.getInt(4));
    assertEquals(glb.length, header.getInt(8));
    assertEquals(0, glb.length % 4);
    String json = json(glb);
    assertFalse(json.contains("NaN"));
    assertFalse(json.contains("Infinity"));
  }

  private static String json(byte[] glb) {
    int length = ByteBuffer.wrap(glb).order(ByteOrder.LITTLE_ENDIAN).getInt(12);
    return new String(glb, 20, length, StandardCharsets.UTF_8);
  }

  private static long count(String text, String needle) {
    return Stream.iterate(text.indexOf(needle), i -> i >= 0, i -> text.indexOf(needle, i + 1))
        .count();
  }

  private static List<String> names(Path directory) throws IOException {
    try (Stream<Path> paths = Files.list(directory)) {
      return paths.map(path -> directory.relativize(path).toString()).sorted().toList();
    }
  }

  private record Bundle(
      byte[] bytes, String manifest, List<TileManifest.Entry> entries, int dataStart) {
    static Bundle read(Path path) throws IOException {
      byte[] bytes = Files.readAllBytes(path);
      assertEquals("MMTB", new String(bytes, 0, 4, StandardCharsets.US_ASCII));
      ByteBuffer header = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
      assertEquals(TileBundle.VERSION, header.getInt(4));
      int manifestLength = header.getInt(8);
      assertEquals(0, manifestLength % 4);
      String manifest =
          new String(bytes, 12, manifestLength, StandardCharsets.UTF_8).stripTrailing();
      List<TileManifest.Entry> entries = new ArrayList<>();
      Matcher matcher = ENTRY.matcher(manifest);
      while (matcher.find()) {
        entries.add(
            new TileManifest.Entry(
                Integer.parseInt(matcher.group(1)),
                Integer.parseInt(matcher.group(2)),
                matcher.group(3),
                Long.parseLong(matcher.group(4)),
                Long.parseLong(matcher.group(5)),
                matcher.group(6),
                Integer.parseInt(matcher.group(7))));
      }
      return new Bundle(bytes, manifest, entries, 12 + manifestLength);
    }

    byte[] tile(int index) {
      TileManifest.Entry entry = entries.get(index);
      int start = dataStart + (int) entry.offset();
      return Arrays.copyOfRange(bytes, start, start + (int) entry.size());
    }
  }
}
