package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class TileBundleTest {
  private static final byte[] ONE_PIXEL_PNG =
      Base64.getDecoder()
          .decode(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/HxoAAAAASUVORK5CYII=");
  private static final float[] UV = {0, 0, 1, 0, 1, 1, 0, 1};

  @TempDir Path tempDir;

  @Test
  void headerStartsWithMagicVersionAndPaddedManifest() {
    TileManifest manifest =
        new TileManifest(
            TileManifest.FORMAT,
            8,
            List.of(new TileManifest.Entry(0, 0, "x0_z0.glb", 0, 5, "b".repeat(64), 1)));
    byte[] json = manifest.toJson().getBytes(StandardCharsets.UTF_8);
    byte[] header = TileBundle.header(manifest);
    ByteBuffer buffer = ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);

    assertEquals("MMTB", new String(header, 0, 4, StandardCharsets.US_ASCII));
    assertEquals(TileBundle.VERSION, buffer.getInt(4));
    int paddedLength = buffer.getInt(8);
    assertEquals(0, paddedLength % 4);
    assertTrue(paddedLength >= json.length && paddedLength - json.length < 4);
    assertEquals(12 + paddedLength, header.length);
    assertArrayEquals(json, Arrays.copyOfRange(header, 12, 12 + json.length));
    for (int i = 12 + json.length; i < header.length; i++) assertEquals(0x20, header[i]);
  }

  @Test
  void headerPadsManifestWithoutExtraBytesWhenAlreadyAligned() {
    TileManifest manifest = new TileManifest(TileManifest.FORMAT, 8, List.of());
    int jsonLength = manifest.toJson().getBytes(StandardCharsets.UTF_8).length;
    byte[] header = TileBundle.header(manifest);
    assertEquals(12 + ((jsonLength + 3) & ~3), header.length);
  }

  @Test
  void writesHeaderFollowedByTilesInManifestOrder() throws IOException {
    TileManifest manifest = writeTiles(tempDir.resolve("tiles"));
    Path output = tempDir.resolve("out/capture.mmtiles");

    TileBundle.write(output, manifest, tempDir.resolve("tiles"));

    ByteArrayOutputStream expected = new ByteArrayOutputStream();
    expected.writeBytes(TileBundle.header(manifest));
    for (TileManifest.Entry entry : manifest.tiles()) {
      expected.writeBytes(Files.readAllBytes(tempDir.resolve("tiles").resolve(entry.file())));
    }
    assertArrayEquals(expected.toByteArray(), Files.readAllBytes(output));
  }

  @Test
  void overwritesExistingOutput() throws IOException {
    TileManifest manifest = writeTiles(tempDir.resolve("tiles"));
    Path output = tempDir.resolve("capture.mmtiles");
    Files.write(output, new byte[] {1, 2, 3});

    TileBundle.write(output, manifest, tempDir.resolve("tiles"));

    assertEquals("MMTB", new String(Files.readAllBytes(output), 0, 4, StandardCharsets.US_ASCII));
    assertEquals(TileBundle.header(manifest).length + manifest.dataBytes(), Files.size(output));
  }

  @Test
  void rejectsChecksumMismatchWithoutLeavingFiles() throws IOException {
    TileManifest good = writeTiles(tempDir.resolve("tiles"));
    TileManifest.Entry first = good.tiles().get(0);
    TileManifest bad =
        replaceFirst(
            good,
            new TileManifest.Entry(
                first.x(),
                first.z(),
                first.file(),
                first.offset(),
                first.size(),
                "0".repeat(64),
                first.quads()));
    assertRejectedWithoutOutput(bad);
  }

  @Test
  void rejectsSizeMismatchWithoutLeavingFiles() throws IOException {
    TileManifest good = writeTiles(tempDir.resolve("tiles"));
    TileManifest.Entry first = good.tiles().get(0);
    TileManifest bad =
        replaceFirst(
            good,
            new TileManifest.Entry(
                first.x(),
                first.z(),
                first.file(),
                first.offset(),
                first.size() + 1,
                first.sha256(),
                first.quads()));
    assertRejectedWithoutOutput(bad);
  }

  @Test
  void rejectsOffsetMismatchWithoutLeavingFiles() throws IOException {
    TileManifest good = writeTiles(tempDir.resolve("tiles"));
    TileManifest.Entry second = good.tiles().get(1);
    TileManifest bad =
        new TileManifest(
            TileManifest.FORMAT,
            good.tileChunks(),
            List.of(
                good.tiles().get(0),
                new TileManifest.Entry(
                    second.x(),
                    second.z(),
                    second.file(),
                    second.offset() + 1,
                    second.size(),
                    second.sha256(),
                    second.quads())));
    assertRejectedWithoutOutput(bad);
  }

  @Test
  void rejectsFileNameThatDoesNotMatchCoordinatesWithoutLeavingFiles() throws IOException {
    TileManifest good = writeTiles(tempDir.resolve("tiles"));
    TileManifest.Entry first = good.tiles().get(0);
    TileManifest bad =
        replaceFirst(
            good,
            new TileManifest.Entry(
                first.x(),
                first.z(),
                "../escape.glb",
                first.offset(),
                first.size(),
                first.sha256(),
                first.quads()));
    assertRejectedWithoutOutput(bad);
  }

  @Test
  void rejectsMissingTileFile() throws IOException {
    TileManifest good = writeTiles(tempDir.resolve("tiles"));
    Files.delete(tempDir.resolve("tiles").resolve(good.tiles().get(0).file()));
    assertRejectedWithoutOutput(good);
  }

  private void assertRejectedWithoutOutput(TileManifest manifest) throws IOException {
    Path output = tempDir.resolve("rejected/capture.mmtiles");
    assertThrows(
        IOException.class, () -> TileBundle.write(output, manifest, tempDir.resolve("tiles")));
    assertFalse(Files.exists(output));
    try (Stream<Path> entries = Files.list(output.getParent())) {
      assertEquals(0, entries.count());
    }
  }

  private static TileManifest replaceFirst(TileManifest manifest, TileManifest.Entry first) {
    return new TileManifest(
        manifest.format(), manifest.tileChunks(), List.of(first, manifest.tiles().get(1)));
  }

  private TileManifest writeTiles(Path directory) throws IOException {
    TiledGlbScene scene = new TiledGlbScene(TileGrid.defaults(), 0, 0, 0);
    scene.addQuad(
        "a",
        "a",
        "stone",
        ONE_PIXEL_PNG,
        0xFFFFFF,
        0,
        0,
        1,
        new float[] {10, 64, 10, 11, 64, 10, 11, 65, 10, 10, 65, 10},
        UV);
    scene.addQuad(
        "b",
        "b",
        "grass",
        ONE_PIXEL_PNG,
        0xFFFFFF,
        0,
        0,
        1,
        new float[] {200, 64, 10, 201, 64, 10, 201, 65, 10, 200, 65, 10},
        UV);
    return scene.write(directory);
  }
}
