package dev.minemories.core;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

final class GlbIndicesTest {
  @TempDir Path directory;

  @Test
  void usesSmallestUnsignedTypeWithoutEmittingPrimitiveRestart() {
    assertEquals(1, GlbIndices.width(252));
    assertEquals(5121, GlbIndices.componentType(255));
    assertEquals(2, GlbIndices.width(256));
    assertEquals(5123, GlbIndices.componentType(65535));
    assertEquals(4, GlbIndices.width(65536));
    assertEquals(5125, GlbIndices.componentType(Integer.MAX_VALUE));
  }

  private static byte[] integers(int... values) {
    ByteBuffer buffer = ByteBuffer.allocate(values.length * 4).order(ByteOrder.LITTLE_ENDIAN);
    for (int value : values) buffer.putInt(value);
    return buffer.array();
  }

  @Test
  void preservesEveryIndexExactlyAndCompactsInPlace() throws IOException {
    byte[] small = integers(0, 1, 2, 0, 2, 254);
    assertEquals(6, GlbIndices.compact(small, small.length, 1));
    assertArrayEquals(new byte[] {0, 1, 2, 0, 2, (byte) 254}, Arrays.copyOf(small, 6));
    byte[] medium = integers(0, 256, 65534);
    assertEquals(6, GlbIndices.compact(medium, medium.length, 2));
    ByteBuffer decoded = ByteBuffer.wrap(medium).order(ByteOrder.LITTLE_ENDIAN);
    assertEquals(0, Short.toUnsignedInt(decoded.getShort()));
    assertEquals(256, Short.toUnsignedInt(decoded.getShort()));
    assertEquals(65534, Short.toUnsignedInt(decoded.getShort()));
    assertEquals(0, GlbIndices.compact(new byte[0], 0, 1));
  }

  @Test
  void refusesCorruptSpoolValuesInsteadOfTruncatingOrEmittingReservedIndices() {
    for (int value : new int[] {-1, 255, 256, 65535, 65536}) {
      assertThrows(IOException.class, () -> GlbIndices.compact(integers(value), 4, 1));
    }
    for (int value : new int[] {-1, 65535, 65536}) {
      assertThrows(IOException.class, () -> GlbIndices.compact(integers(value), 4, 2));
    }
    for (int length : new int[] {-1, 1, 5}) {
      assertThrows(
          IllegalArgumentException.class, () -> GlbIndices.compact(new byte[4], length, 1));
    }
    assertThrows(IllegalArgumentException.class, () -> GlbIndices.compact(new byte[4], 4, 4));
  }

  @Test
  void bothWritersPreserveBoundaryIndicesAndChooseTheSamePackedLayout() throws IOException {
    for (int quads : new int[] {63, 64, 16383, 16384}) {
      GlbScene memory = new GlbScene();
      Path first = directory.resolve("memory-" + quads + ".glb"),
          second = directory.resolve("spool-" + quads + ".glb");
      try (SpoolingGlbScene spool = new SpoolingGlbScene(directory)) {
        for (int i = 0; i < quads; i++) {
          memory.addQuad(
              "part",
              "part",
              "sprite",
              SpoolingGlbSceneTest.PNG,
              0xffffff,
              1,
              0,
              1,
              SpoolingGlbSceneTest.XYZ,
              SpoolingGlbSceneTest.UV);
          SpoolingGlbSceneTest.add(spool, "part");
        }
        memory.write(first);
        spool.write(second);
        // Compare binary geometry independently of intentionally different test material factors.
        byte[] a = Files.readAllBytes(first), b = Files.readAllBytes(second);
        ByteBuffer parsed = ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN);
        int jsonBytes = parsed.getInt(12);
        String json = new String(b, 20, jsonBytes, StandardCharsets.UTF_8);
        int vertices = quads * 4, width = GlbIndices.width(vertices);
        assertTrue(json.contains("\"componentType\":" + GlbIndices.componentType(vertices)));
        int bin = 28 + jsonBytes;
        int last = bin + vertices * 32 + (quads * 6 - 1) * width;
        int value =
            switch (width) {
              case 1 -> Byte.toUnsignedInt(parsed.get(last));
              case 2 -> Short.toUnsignedInt(parsed.getShort(last));
              default -> parsed.getInt(last);
            };
        assertEquals(vertices - 1, value);
        int aJson = ByteBuffer.wrap(a).order(ByteOrder.LITTLE_ENDIAN).getInt(12);
        assertArrayEquals(
            Arrays.copyOfRange(a, 28 + aJson, a.length), Arrays.copyOfRange(b, bin, b.length));
      }
    }
  }
}
