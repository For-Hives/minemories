package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.io.InterruptedIOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class SpoolingGlbSceneTest {
  static final byte[] PNG =
      Base64.getDecoder()
          .decode(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/HxoAAAAASUVORK5CYII=");
  static final float[] XYZ = {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0};
  static final float[] UV = {0, 0, 1, 0, 1, 1, 0, 1};
  @TempDir Path temporary;

  private static SpoolingGlbScene.Limits limits(
      int materials,
      int textures,
      int lights,
      int names,
      int json,
      long spool,
      long file,
      int open) {
    return new SpoolingGlbScene.Limits(materials, textures, lights, names, json, spool, file, open);
  }

  private SpoolingGlbScene scene() throws IOException {
    return new SpoolingGlbScene(temporary);
  }

  static void add(SpoolingGlbScene scene, String key) throws IOException {
    scene.addQuad(key, "material " + key, "sprite", PNG, 0x70ff98, 0, 0, 1, XYZ, UV);
  }

  private void noSpools() throws IOException {
    try (var paths = Files.list(temporary)) {
      assertFalse(
          paths.anyMatch(
              path ->
                  Objects.requireNonNull(path.getFileName())
                      .toString()
                      .startsWith(".minemories-")));
    }
  }

  private Path spool() throws IOException {
    try (var paths = Files.list(temporary)) {
      return paths
          .filter(
              path ->
                  Objects.requireNonNull(path.getFileName())
                      .toString()
                      .startsWith(".minemories-spool-"))
          .findFirst()
          .orElseThrow();
    }
  }

  @Test
  void byteEquivalentToLegacyWithAllMaterialAndGeometryProperties() throws IOException {
    GlbScene legacy = new GlbScene();
    Path old = temporary.resolve("old.glb"), output = temporary.resolve("new.glb");
    try (SpoolingGlbScene scene = scene()) {
      for (int part = 0; part < 3; part++) {
        String key = "part" + part;
        float emission = part == 0 ? Float.NaN : part * 0.4f;
        float opacity = part == 2 ? 0.5f : Float.POSITIVE_INFINITY;
        for (int quad = 0; quad < 3; quad++) {
          float[] positions = XYZ.clone();
          for (int vertex = 0; vertex < 4; vertex++) positions[vertex * 3 + 2] = part + quad * 0.2f;
          legacy.addQuad(
              key,
              "line\n\"\\ é " + part,
              "sprite\tname",
              PNG,
              0x55aaf0 + part,
              part,
              emission,
              opacity,
              positions,
              UV);
          scene.addQuad(
              key,
              "line\n\"\\ é " + part,
              "sprite\tname",
              PNG,
              0x55aaf0 + part,
              part,
              emission,
              opacity,
              positions,
              UV);
        }
      }
      // Same quantized position retains the first light, as in the existing exporter.
      legacy.addPointLight(0.5f, 1.5f, 0.5f, 0xffaa70, 15);
      scene.addPointLight(0.5f, 1.5f, 0.5f, 0xffaa70, 15);
      legacy.addPointLight(0.51f, 1.51f, 0.51f, 0x000000, 7);
      scene.addPointLight(0.51f, 1.51f, 0.51f, 0x000000, 7);
      legacy.addPointLight(2, 4, 1, 0x70aaff, 4);
      scene.addPointLight(2, 4, 1, 0x70aaff, 4);
      legacy.write(old);
      scene.write(output);
      assertArrayEquals(Files.readAllBytes(old), Files.readAllBytes(output));
      assertTrue(scene.hasGeometry());
      assertEquals(3, scene.materialCount());
      assertEquals(9, scene.metrics().quads());
      assertEquals(1, scene.metrics().textures());
      assertTrue(scene.metrics().peakOpenFiles() <= 8);
    }
    noSpools();
  }

  @Test
  void extremeFiniteAndDegenerateGeometryKeepFiniteNormals() throws IOException {
    GlbScene legacy = new GlbScene();
    try (SpoolingGlbScene scene = scene()) {
      for (float[] positions :
          List.of(
              new float[12],
              new float[] {
                -Float.MAX_VALUE,
                0,
                0,
                Float.MAX_VALUE,
                0,
                0,
                Float.MAX_VALUE,
                Float.MAX_VALUE,
                0,
                -Float.MAX_VALUE,
                Float.MAX_VALUE,
                0
              })) {
        legacy.addQuad("all", "extreme", "sprite", PNG, 0, 0, 0, 1, positions, UV);
        scene.addQuad("all", "extreme", "sprite", PNG, 0, 0, 0, 1, positions, UV);
      }
      Path old = temporary.resolve("extreme-old.glb"), output = temporary.resolve("extreme.glb");
      legacy.write(old);
      scene.write(output);
      byte[] expected = Files.readAllBytes(old), actual = Files.readAllBytes(output);
      int binaryStart = 28 + ByteBuffer.wrap(actual).order(ByteOrder.LITTLE_ENDIAN).getInt(12);
      int normalStart = binaryStart + 96;
      // main now fixes extreme float subtraction too; the complete GLB must stay equivalent.
      assertArrayEquals(expected, actual);
      ByteBuffer normals = ByteBuffer.wrap(actual).order(ByteOrder.LITTLE_ENDIAN);
      for (int vertex = 0; vertex < 8; vertex++) {
        assertEquals(0f, normals.getFloat(normalStart + vertex * 12));
        assertEquals(0f, normals.getFloat(normalStart + vertex * 12 + 4));
        assertEquals(vertex < 4 ? 0f : 1f, normals.getFloat(normalStart + vertex * 12 + 8));
      }
      String json = json(output);
      assertFalse(json.contains("Infinity"));
      assertFalse(json.contains("NaN"));
    }
  }

  @Test
  void copiedInputsCanBeReusedImmediatelyAndImagesAreDeduplicated() throws IOException {
    byte[] png = PNG.clone();
    float[] positions = XYZ.clone(), uv = UV.clone();
    GlbScene legacy = new GlbScene();
    legacy.addQuad("first", "first", "shared", png, 0, 0, 0, 1, positions, uv);
    legacy.addQuad("second", "second", "shared", png, 1, 1, 0, 1, positions, uv);
    Path expected = temporary.resolve("expected.glb");
    legacy.write(expected);
    try (SpoolingGlbScene scene = scene()) {
      scene.addQuad("first", "first", "shared", png, 0, 0, 0, 1, positions, uv);
      scene.addQuad("second", "second", "shared", png, 1, 1, 0, 1, positions, uv);
      Arrays.fill(png, (byte) 0);
      Arrays.fill(positions, Float.NaN);
      Arrays.fill(uv, 42);
      Path output = temporary.resolve("copy.glb");
      scene.write(output);
      assertArrayEquals(Files.readAllBytes(expected), Files.readAllBytes(output));
      assertEquals(1, scene.metrics().textures());
    }
  }

  @Test
  void invalidQuadsAndLightsAreDroppedButAnEmptySceneCannotReplaceTheLastCapture()
      throws IOException {
    Path output = temporary.resolve("last.glb");
    Files.writeString(output, "last valid memory");
    try (SpoolingGlbScene scene = scene()) {
      for (float value :
          new float[] {Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY}) {
        float[] positions = XYZ.clone(), uv = UV.clone();
        positions[11] = value;
        scene.addQuad("bad-position", "bad", "sprite", PNG, 0, 0, 0, 1, positions, UV);
        uv[7] = value;
        scene.addQuad("bad-uv", "bad", "sprite", PNG, 0, 0, 0, 1, XYZ, uv);
        scene.addPointLight(value, 0, 0, 0, 15);
        scene.addPointLight(0, value, 0, 0, 15);
        scene.addPointLight(0, 0, value, 0, 15);
      }
      scene.addPointLight(0, 0, 0, 0, 3);
      scene.addPointLight(0, 0, 0, 0, 4);
      assertFalse(scene.hasGeometry());
      assertEquals(0, scene.materialCount());
      assertThrows(IOException.class, () -> scene.write(output));
      assertEquals("last valid memory", Files.readString(output));
      assertThrows(IOException.class, () -> add(scene, "after-failure"));
    }
    noSpools();
  }

  @Test
  void rejectsWrongArrayShapesWithoutCopyingThem() throws IOException {
    try (SpoolingGlbScene scene = scene()) {
      assertThrows(
          IllegalArgumentException.class,
          () -> scene.addQuad("short", "name", "sprite", PNG, 0, 0, 0, 1, new float[11], UV));
      assertThrows(
          IllegalArgumentException.class,
          () -> scene.addQuad("short", "name", "sprite", PNG, 0, 0, 0, 1, XYZ, new float[7]));
      assertFalse(scene.hasGeometry());
      add(scene, "valid");
      scene.write(temporary.resolve("valid.glb"));
    }
  }

  @Test
  void boundsOpenDescriptorsEvenWhenMaterialsAreInterleaved() throws IOException {
    GlbScene legacy = new GlbScene();
    var limits = limits(32, 8, 128, 4096, 65536, 1_000_000, 1_000_000, 2);
    try (SpoolingGlbScene scene = new SpoolingGlbScene(temporary, limits)) {
      for (int round = 0; round < 2; round++) {
        for (int material = 0; material < 7; material++) {
          String key = "material" + material, image = "image" + (material % 2);
          byte[] png = PNG.clone();
          if ((material & 1) != 0) png[png.length - 1] ^= 1;
          legacy.addQuad(key, key, image, png, material, 0, 0, 1, XYZ, UV);
          scene.addQuad(key, key, image, png, material, 0, 0, 1, XYZ, UV);
        }
      }
      Path old = temporary.resolve("many-old.glb"), output = temporary.resolve("many.glb");
      legacy.write(old);
      scene.write(output);
      assertArrayEquals(Files.readAllBytes(old), Files.readAllBytes(output));
      assertEquals(2, scene.metrics().peakOpenFiles());
      assertEquals(2, scene.metrics().textures());
    }
    noSpools();
  }

  @Test
  void materialTextureAndLightLimitsInvalidateRatherThanTruncate() throws IOException {
    var materialLimits = limits(1, 1, 1, 4096, 65536, 1_000_000, 1_000_000, 2);
    try (SpoolingGlbScene scene = new SpoolingGlbScene(temporary, materialLimits)) {
      add(scene, "one");
      assertThrows(IOException.class, () -> add(scene, "two"));
      assertFalse(scene.hasGeometry());
    }
    noSpools();
    var textureLimits = limits(2, 1, 1, 4096, 65536, 1_000_000, 1_000_000, 2);
    try (SpoolingGlbScene scene = new SpoolingGlbScene(temporary, textureLimits)) {
      add(scene, "one");
      assertThrows(
          IOException.class,
          () -> scene.addQuad("two", "two", "second sprite", PNG, 0, 0, 0, 1, XYZ, UV));
    }
    noSpools();
    try (SpoolingGlbScene scene = new SpoolingGlbScene(temporary, materialLimits)) {
      add(scene, "one");
      scene.addPointLight(1, 1, 1, 0, 15);
      assertThrows(IOException.class, () -> scene.addPointLight(2, 2, 2, 0, 15));
    }
    noSpools();
  }

  @Test
  void namesAreBoundedInUtf8BeforeTheyCanGrowJsonMemory() throws IOException {
    var limits = limits(2, 2, 0, 8, 65536, 1_000_000, 1_000_000, 2);
    for (String name : List.of("x".repeat(9), "é".repeat(5))) {
      try (SpoolingGlbScene scene = new SpoolingGlbScene(temporary, limits)) {
        assertThrows(
            IOException.class, () -> scene.addQuad("key", name, "image", PNG, 0, 0, 0, 1, XYZ, UV));
      }
      noSpools();
    }
  }

  @Test
  void spoolBudgetCountsSharedTexturesOnceAndEveryGeometryByte() throws IOException {
    var limits = limits(2, 2, 0, 4096, 65536, PNG.length + 304, 1_000_000, 2);
    try (SpoolingGlbScene scene = new SpoolingGlbScene(temporary, limits)) {
      add(scene, "one");
      add(scene, "two");
      assertEquals(PNG.length + 304, scene.metrics().spoolBytes());
      assertThrows(IOException.class, () -> add(scene, "one"));
    }
    noSpools();
    var textureOnly = limits(2, 2, 0, 4096, 65536, PNG.length - 1, 1_000_000, 2);
    try (SpoolingGlbScene scene = new SpoolingGlbScene(temporary, textureOnly)) {
      assertThrows(IOException.class, () -> add(scene, "one"));
    }
    noSpools();
  }

  @Test
  void jsonAndFinalFileLimitsAreCheckedAgainstActualEncodedLengths() throws IOException {
    Path baseline = temporary.resolve("baseline.glb");
    long jsonBytes;
    try (SpoolingGlbScene scene = scene()) {
      add(scene, "one");
      scene.write(baseline);
      jsonBytes = scene.metrics().spoolBytes() - PNG.length - 152;
    }
    Path target = temporary.resolve("last.glb");
    Files.writeString(target, "previous");
    var smallJson = limits(2, 2, 0, 4096, (int) jsonBytes - 1, 1_000_000, 1_000_000, 2);
    try (SpoolingGlbScene scene = new SpoolingGlbScene(temporary, smallJson)) {
      add(scene, "one");
      assertThrows(IOException.class, () -> scene.write(target));
      assertEquals("previous", Files.readString(target));
    }
    noSpools();
    var smallFile = limits(2, 2, 0, 4096, 65536, 1_000_000, Files.size(baseline) - 1, 2);
    try (SpoolingGlbScene scene = new SpoolingGlbScene(temporary, smallFile)) {
      add(scene, "one");
      assertThrows(IOException.class, () -> scene.write(target));
      assertEquals("previous", Files.readString(target));
    }
    noSpools();
    var exact =
        limits(
            2, 2, 0, 4096, (int) jsonBytes, PNG.length + 152 + jsonBytes, Files.size(baseline), 2);
    try (SpoolingGlbScene scene = new SpoolingGlbScene(temporary, exact)) {
      add(scene, "one");
      scene.write(target);
      assertArrayEquals(Files.readAllBytes(baseline), Files.readAllBytes(target));
    }
    noSpools();
  }

  @Test
  void rejectsEmptyOrConflictingTextureDefinitions() throws IOException {
    try (SpoolingGlbScene scene = scene()) {
      assertThrows(
          IOException.class,
          () -> scene.addQuad("first", "name", "sprite", new byte[0], 0, 0, 0, 1, XYZ, UV));
    }
    noSpools();
    for (byte[] changed : List.of(new byte[PNG.length - 1], new byte[PNG.length])) {
      try (SpoolingGlbScene scene = scene()) {
        add(scene, "one");
        assertThrows(
            IOException.class,
            () -> scene.addQuad("two", "name", "sprite", changed, 0, 0, 0, 1, XYZ, UV));
      }
      noSpools();
    }
  }

  @Test
  void ioFailuresInvalidateAndCleanTheSpoolWithoutChangingAnExistingTarget() throws IOException {
    Path target = temporary.resolve("last.glb");
    Files.writeString(target, "previous");
    try (SpoolingGlbScene scene = scene()) {
      add(scene, "one");
      Files.write(
          spool().resolve("p0-positions"), new byte[10], java.nio.file.StandardOpenOption.APPEND);
      assertThrows(IOException.class, () -> scene.write(target));
      assertEquals("previous", Files.readString(target));
    }
    noSpools();
    Path blocked = temporary.resolve("blocked");
    Files.writeString(blocked, "keep");
    try (SpoolingGlbScene scene = scene()) {
      add(scene, "one");
      assertThrows(IOException.class, () -> scene.write(blocked.resolve("capture.glb")));
      assertEquals("keep", Files.readString(blocked));
    }
    noSpools();
  }

  @Test
  void interruptionIsPreservedAndCannotPublishOrBeRetriedOnTheInvalidBuilder() throws IOException {
    Path output = temporary.resolve("last.glb");
    Files.writeString(output, "previous");
    try (SpoolingGlbScene scene = scene()) {
      add(scene, "one");
      try {
        Thread.currentThread().interrupt();
        assertThrows(InterruptedIOException.class, () -> scene.write(output));
        assertTrue(Thread.currentThread().isInterrupted());
      } finally {
        Thread.interrupted();
      }
      assertEquals("previous", Files.readString(output));
      assertThrows(IOException.class, () -> add(scene, "after"));
    }
    noSpools();
  }

  @Test
  void cleanupNeverTraversesAReplacedSpoolDirectoryOrSymlink() throws IOException {
    Path outside = temporary.resolve("outside");
    Files.createDirectory(outside);
    Files.writeString(outside.resolve("p0-positions"), "private");
    SpoolingGlbScene scene = scene();
    add(scene, "one");
    Path original = spool(), moved = temporary.resolve("moved-spool");
    Files.move(original, moved);
    Files.createSymbolicLink(original, outside);
    IOException error = assertThrows(IOException.class, () -> add(scene, "two"));
    assertTrue(error.getSuppressed().length > 0);
    assertEquals("private", Files.readString(outside.resolve("p0-positions")));
    assertThrows(IOException.class, scene::close);
    Files.delete(original);
    Files.move(moved, original);
    scene.close();
    noSpools();
  }

  @Test
  void failedCleanupStillRemovesOtherOwnedFilesAndNeverRecursesIntoForeignChildren()
      throws IOException {
    SpoolingGlbScene scene = scene();
    add(scene, "one");
    Path output = temporary.resolve("valid.glb");
    scene.write(output);
    Path root = spool(),
        replaced = root.resolve("p0-positions"),
        foreign = replaced.resolve("foreign");
    Files.delete(replaced);
    Files.createDirectory(replaced);
    Files.writeString(foreign, "keep");
    IOException failure = assertThrows(IOException.class, scene::close);
    assertTrue(failure.getSuppressed().length > 0);
    assertEquals("keep", Files.readString(foreign));
    assertTrue(Files.isRegularFile(output));
    try (var remaining = Files.list(root)) {
      assertEquals(List.of(replaced), remaining.toList());
    }
    Files.delete(foreign);
    Files.delete(replaced);
    scene.close();
    noSpools();
  }

  @Test
  void outputInsideTheSpoolIsRejectedAndTheSealedSceneCannotBeMutated() throws IOException {
    try (SpoolingGlbScene scene = scene()) {
      add(scene, "one");
      assertThrows(IOException.class, () -> scene.write(spool().resolve("capture.glb")));
    }
    noSpools();
    SpoolingGlbScene scene = scene();
    add(scene, "one");
    Path first = temporary.resolve("first.glb"), second = temporary.resolve("second.glb");
    scene.write(first);
    scene.write(second);
    assertArrayEquals(Files.readAllBytes(first), Files.readAllBytes(second));
    assertThrows(IOException.class, () -> add(scene, "two"));
    scene.close();
    scene.close();
    assertThrows(IOException.class, () -> scene.write(first));
    noSpools();
  }

  @Test
  void unsupportedSpoolFilesystemFailsBeforeAcceptingData() throws IOException {
    Path archive = temporary.resolve("spool.zip");
    try (var fileSystem =
        java.nio.file.FileSystems.newFileSystem(
            java.net.URI.create("jar:" + archive.toUri()), java.util.Map.of("create", "true"))) {
      Path parent = fileSystem.getPath("/spools");
      assertThrows(IOException.class, () -> new SpoolingGlbScene(parent));
      try (var children = Files.list(parent)) {
        assertEquals(0, children.count());
      }
    }
  }

  @Test
  void invalidLimitsFailBeforeCreatingAnyDirectory() throws IOException {
    int[] invalid = {-1, 0};
    for (int value : invalid) {
      assertThrows(IllegalArgumentException.class, () -> limits(value, 1, 1, 1, 1, 1, 28, 1));
      assertThrows(IllegalArgumentException.class, () -> limits(1, value, 1, 1, 1, 1, 28, 1));
      assertThrows(IllegalArgumentException.class, () -> limits(1, 1, 1, value, 1, 1, 28, 1));
      assertThrows(IllegalArgumentException.class, () -> limits(1, 1, 1, 1, value, 1, 28, 1));
      assertThrows(IllegalArgumentException.class, () -> limits(1, 1, 1, 1, 1, value, 28, 1));
      assertThrows(IllegalArgumentException.class, () -> limits(1, 1, 1, 1, 1, 1, 28, value));
    }
    assertThrows(IllegalArgumentException.class, () -> limits(1, 1, -1, 1, 1, 1, 28, 1));
    assertThrows(IllegalArgumentException.class, () -> limits(1, 1, 1, 1, 1, 1, 27, 1));
    assertThrows(IllegalArgumentException.class, () -> limits(1, 1, 1, 1, 1, 1, 0x1_0000_0000L, 1));
    assertThrows(IllegalArgumentException.class, () -> limits(1, 1, 1, 1, 1, 1, 28, 1));
    assertThrows(IllegalArgumentException.class, () -> limits(1, 1, 1, 1, 1, 1, 28, 65));
    noSpools();
  }

  @Test
  void writesMoreThanTwiceTheChildHeapWithoutBufferingTheGlb() throws Exception {
    String classpath =
        Path.of(SpoolingGlbScene.class.getProtectionDomain().getCodeSource().getLocation().toURI())
            + java.io.File.pathSeparator
            + Path.of(
                SpoolingGlbProbe.class.getProtectionDomain().getCodeSource().getLocation().toURI());
    Path output = temporary.resolve("large.glb"), log = temporary.resolve("probe.log");
    Process child =
        new ProcessBuilder(
                Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                "-Xms16m",
                "-Xmx32m",
                "-cp",
                classpath,
                SpoolingGlbProbe.class.getName(),
                output.toString(),
                "600000")
            .redirectErrorStream(true)
            .redirectOutput(log.toFile())
            .start();
    try {
      assertTrue(child.waitFor(120, TimeUnit.SECONDS), "bounded-heap writer timed out");
      assertEquals(0, child.exitValue(), Files.readString(log));
      assertTrue(Files.size(output) > 80L * 1024 * 1024);
      assertTrue(Files.readString(log).contains("maxHeap=33554432"));
      try (var input = Files.newInputStream(output)) {
        ByteBuffer header = ByteBuffer.wrap(input.readNBytes(12)).order(ByteOrder.LITTLE_ENDIAN);
        assertEquals(0x46546c67, header.getInt());
        assertEquals(2, header.getInt());
        assertEquals(Files.size(output), Integer.toUnsignedLong(header.getInt()));
      }
    } finally {
      child.destroyForcibly();
    }
    noSpools();
  }

  private static String json(Path output) throws IOException {
    byte[] bytes = Files.readAllBytes(output);
    return new String(
            bytes,
            20,
            ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).getInt(12),
            StandardCharsets.UTF_8)
        .trim();
  }
}
