package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.JsonObject;
import dev.minemories.core.ChunkStats;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ZoneInsightsTest {
  @TempDir Path directory;

  private static ChunkStats.Chunk chunk(
      int x, int z, int quads, int built, int entities, int lights, long fp) {
    return new ChunkStats.Chunk(x, z, quads, built, entities, lights, fp);
  }

  @Test
  void aCaptureIsMergedAtAbsoluteChunksAndTheNextOneReportsWhatChanged() {
    var insights = new ZoneInsights();
    // Origin x = 40 is in chunk 2, z = -1 in chunk -1: chunk (1, 0) relative is absolute (3, -1).
    var first =
        insights.merge(
            40, -1, List.of(chunk(1, 0, 100, 25, 48, 3, 7), chunk(0, 0, 10, 0, 0, 0, 8)));
    assertEquals(new ZoneInsights.Merge(2, 0, 2), first);
    assertEquals(new ZoneInsights.Chunk(250, 2, 3, 7), insights.chunk(3, -1));
    // The same place seen from another origin: chunk (0, 0) relative to x = 56 is absolute 3.
    var second =
        insights.merge(
            56, -1, List.of(chunk(0, 0, 100, 25, 48, 3, 7), chunk(-1, 0, 10, 0, 0, 0, 99)));
    assertEquals(new ZoneInsights.Merge(2, 1, 0), second);
    assertEquals(2, insights.size());
  }

  @Test
  void theStoreIsBoundedAndPersistsOnlyWhatChanged() throws IOException {
    var insights = new ZoneInsights();
    List<ChunkStats.Chunk> many = new ArrayList<>();
    for (int index = 0; index < ZoneInsights.MAX_CHUNKS + 5; index++)
      many.add(chunk(index, 0, 1, 0, 0, 0, index));
    insights.merge(0, 0, many);
    assertEquals(ZoneInsights.MAX_CHUNKS, insights.size());
    assertNull(insights.chunk(0, 0));
    Path file = directory.resolve("world.insights");
    insights.save(file);
    long modified = Files.getLastModifiedTime(file).toMillis();
    insights.save(file);
    assertEquals(modified, Files.getLastModifiedTime(file).toMillis());
    var reloaded = ZoneInsights.read(file);
    assertEquals(ZoneInsights.MAX_CHUNKS, reloaded.size());
    assertEquals(insights.chunk(100, 0), reloaded.chunk(100, 0));
  }

  @Test
  void damagedOrHostileFilesAreRecoveredOrRefusedWithoutThrowingOnBadLines() throws IOException {
    Path file = directory.resolve("damaged.insights");
    Files.writeString(
        file,
        "1=250,2,3,ff\nbad=1,2,3,4\n2=2000,1,1,1\n3=1,2\n4=1,2,3,zz\n5=-1,1,1,1\n6=1,1,200000,1\n"
            + (4_294_967_297L)
            + "=10,0,0,1\n");
    var read = ZoneInsights.read(file);
    assertEquals(new ZoneInsights.Chunk(250, 2, 3, 0xff), read.chunk(0, 1));
    assertEquals(new ZoneInsights.Chunk(10, 0, 0, 1), read.chunk(1, 1));
    assertEquals(2, read.size());
    assertEquals(0, ZoneInsights.read(directory.resolve("missing")).size());
    Files.write(file, new byte[2 * 1024 * 1024 + 1]);
    assertThrows(IOException.class, () -> ZoneInsights.read(file));
    Path folder = Files.createDirectory(directory.resolve("folder"));
    assertThrows(IOException.class, () -> ZoneInsights.read(folder));
  }

  @Test
  void theCaptureOriginComesFromTheMetadataAndDefaultsToZero() {
    var metadata = new JsonObject();
    assertArrayEquals(new int[3], QueuedGlbCapture.captureOrigin(metadata));
    metadata.addProperty("captureOrigin", "none");
    assertArrayEquals(new int[3], QueuedGlbCapture.captureOrigin(metadata));
    var origin = new JsonObject();
    origin.addProperty("x", -1399);
    origin.addProperty("y", 177);
    origin.addProperty("z", "text");
    metadata.add("captureOrigin", origin);
    assertArrayEquals(new int[] {-1399, 177, 0}, QueuedGlbCapture.captureOrigin(metadata));
  }
}
