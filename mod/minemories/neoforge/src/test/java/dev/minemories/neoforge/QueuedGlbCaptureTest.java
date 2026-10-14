package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.*;

import dev.minemories.core.GlbScene;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class QueuedGlbCaptureTest {
  @TempDir Path directory;
  private static final Instant TIME = Instant.parse("2026-10-14T12:00:00Z");
  private static final float[] POSITIONS = {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0};
  private static final float[] UV = {0, 0, 1, 0, 1, 1, 0, 1};

  @Test
  void copiedBandsAndPrimitivesProduceACompleteLegacyEquivalentGlbOffTheCallerThread()
      throws Exception {
    int[] rgba = {0xff0000ff, 0xff00ff00, 0xffff0000, 0x00ffffff};
    byte[] png = RenderedTexture.fromRgba(2, 2, rgba).png();
    var element = new CaptureElement();
    element.addRenderedQuad(
        "key", "name", "image", new byte[0], 0xffffff, 0, 0, 1, POSITIONS, UV, 1);
    element.addPointLight(0, 2, 0, 0xffffff, 15);
    var snapshot = element.seal();
    try (var worker = new QueuedGlbCapture(directory)) {
      awaitOffer(() -> call(() -> worker.offerTexture("image", 2, 2)));
      awaitOffer(() -> call(() -> worker.offerRows("image", 0, rgba)));
      rgba[0] = 0; // Admission consumes a copy, rather than an array the producer can reuse.
      awaitOffer(() -> call(() -> worker.offerTextureEnd("image")));
      awaitOffer(() -> call(() -> worker.offerGeometry(snapshot.quads(), snapshot.lights())));
      awaitOffer(() -> call(() -> worker.finish(TIME, "{\"capturedAt\":\"" + TIME + "\"}")));
      var result = worker.completion().toCompletableFuture().get(10, TimeUnit.SECONDS);
      assertEquals(1, result.quads());
      assertEquals(1, result.textures());
      assertEquals(1, result.materials());
      assertTrue(worker.done());
      var reference = new GlbScene();
      float[] expected = POSITIONS.clone();
      RenderedLayer.separate(expected, 1);
      reference.addQuad("key", "name", "image", png, 0xffffff, 1, 0, 1, expected, UV);
      reference.addPointLight(0, 2, 0, 0xffffff, 15);
      Path old = directory.resolve("reference.glb");
      reference.write(old);
      assertArrayEquals(Files.readAllBytes(old), Files.readAllBytes(result.file()));
      var metadata = CaptureHistory.metadata(result.file());
      assertEquals(TIME.toString(), metadata.get("captureStartedAt").getAsString());
      assertEquals(result.finishedAt().toString(), metadata.get("captureFinishedAt").getAsString());
    }
    try (var files = Files.list(directory.resolve(".minemories-work"))) {
      assertEquals(0, files.count());
    }
  }

  @Test
  void unfinishedTextureOrMissingImageFailsWithoutReplacingAnExistingCapture() throws Exception {
    Path previous =
        CaptureHistory.save(directory, TIME, "{}", file -> Files.writeString(file, "previous"));
    try (var worker = new QueuedGlbCapture(directory)) {
      awaitOffer(() -> call(() -> worker.offerTexture("image", 2, 2)));
      awaitOffer(() -> call(() -> worker.offerRows("image", 0, new int[2])));
      awaitOffer(() -> call(() -> worker.offerTextureEnd("image")));
      assertThrows(
          ExecutionException.class,
          () -> worker.completion().toCompletableFuture().get(10, TimeUnit.SECONDS));
    }
    var element = new CaptureElement();
    element.addQuad("key", "name", "absent", new byte[0], 0xffffff, 0, 0, 1, POSITIONS, UV);
    var missingImage = element.seal();
    try (var worker = new QueuedGlbCapture(directory)) {
      awaitOffer(() -> call(() -> worker.offerGeometry(missingImage.quads(), List.of())));
      assertThrows(
          ExecutionException.class,
          () -> worker.completion().toCompletableFuture().get(10, TimeUnit.SECONDS));
    }
    assertEquals(previous, CaptureHistory.latest(directory));
    assertEquals("previous", Files.readString(directory.resolve("capture.glb")));
    try (var files = Files.list(directory.resolve(".minemories-work"))) {
      assertEquals(0, files.count());
    }
  }

  @Test
  void cancellationWakesAWaitingWorkerAndTheResultCannotBeCompletedByTheProducer()
      throws Exception {
    var worker = new QueuedGlbCapture(directory);
    var detached = worker.completion().toCompletableFuture();
    detached.cancel(false);
    assertFalse(
        worker.done(), "Cancelling a detached view must not publish or abandon a live worker");
    worker.close();
    assertThrows(
        ExecutionException.class,
        () -> worker.completion().toCompletableFuture().get(10, TimeUnit.SECONDS));
    worker.close();
    assertFalse(worker.offerTexture("image", 1, 1));
    try (var files = Files.list(directory.resolve(".minemories-work"))) {
      assertEquals(0, files.count());
    }
  }

  @Test
  void aLargeTextureStreamsInSmallBandsAndProducesAnEmbeddedImage() throws Exception {
    int[] band = new int[QueuedGlbCapture.MAX_BAND_PIXELS];
    java.util.Arrays.fill(band, -1);
    var element = new CaptureElement();
    element.addQuad("key", "name", "large", new byte[0], 0xffffff, 0, 0, 1, POSITIONS, UV);
    var snapshot = element.seal();
    try (var worker = new QueuedGlbCapture(directory)) {
      awaitOffer(() -> call(() -> worker.offerTexture("large", 2048, 2048)));
      for (int row = 0; row < 2048; row += 32) {
        int start = row;
        awaitOffer(() -> call(() -> worker.offerRows("large", start, band)));
      }
      awaitOffer(() -> call(() -> worker.offerTextureEnd("large")));
      awaitOffer(() -> call(() -> worker.offerGeometry(snapshot.quads(), List.of())));
      awaitOffer(() -> call(() -> worker.finish(TIME, "{}")));
      var result = worker.completion().toCompletableFuture().get(15, TimeUnit.SECONDS);
      byte[] glb = Files.readAllBytes(result.file());
      int jsonLength =
          java.nio.ByteBuffer.wrap(glb).order(java.nio.ByteOrder.LITTLE_ENDIAN).getInt(12);
      var json =
          com.google.gson.JsonParser.parseString(
                  new String(glb, 20, jsonLength, java.nio.charset.StandardCharsets.UTF_8))
              .getAsJsonObject();
      int view =
          json.getAsJsonArray("images").get(0).getAsJsonObject().get("bufferView").getAsInt();
      var image = json.getAsJsonArray("bufferViews").get(view).getAsJsonObject();
      int offset = 28 + jsonLength + image.get("byteOffset").getAsInt();
      var decoded =
          javax.imageio.ImageIO.read(
              new java.io.ByteArrayInputStream(glb, offset, image.get("byteLength").getAsInt()));
      assertEquals(2048, decoded.getWidth());
      assertEquals(2048, decoded.getHeight());
      assertEquals(-1, decoded.getRGB(2047, 2047));
    }
  }

  @Test
  void rejectsOversizedProducerPacketsBeforeTheyEnterTheQueue() throws Exception {
    var worker = new QueuedGlbCapture(directory);
    try (worker) {
      assertThrows(
          IOException.class,
          () -> worker.offerRows("image", 0, new int[QueuedGlbCapture.MAX_BAND_PIXELS + 1]));
      assertThrows(IOException.class, () -> worker.offerTexture("", 1, 1));
      assertThrows(IOException.class, () -> worker.offerTexture("x".repeat(4097), 1, 1));
      assertThrows(IOException.class, () -> worker.offerTexture("image", 16385, 1));
      assertThrows(
          IOException.class,
          () -> worker.finish(TIME, "x".repeat(CaptureHistory.MAX_METADATA_BYTES + 1)));
    }
    assertThrows(
        ExecutionException.class,
        () -> worker.completion().toCompletableFuture().get(10, TimeUnit.SECONDS));
  }

  private interface Offer {
    boolean get() throws IOException;
  }

  private static boolean call(Offer offer) {
    try {
      return offer.get();
    } catch (IOException error) {
      throw new java.io.UncheckedIOException(error);
    }
  }

  private static void awaitOffer(BooleanSupplier offer) {
    long began = System.nanoTime();
    while (!offer.getAsBoolean()) {
      if (System.nanoTime() - began > TimeUnit.SECONDS.toNanos(5))
        fail("Producer queue never became available");
      Thread.yield();
    }
  }
}
