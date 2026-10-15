package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import dev.minemories.core.GlbScene;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CaptureSinkTest {
  @TempDir Path directory;

  @Test
  void manualSinkKeepsTheLegacyGlbBytesIncludingSecondaryLayerSeparation() throws Exception {
    byte[] png =
        Base64.getDecoder()
            .decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHAAAAABJRU5ErkJggg==");
    var sink = new CaptureSink.Legacy();
    var legacy = new GlbScene();
    float[] positions = {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0}, uv = {0, 0, 1, 0, 1, 1, 0, 1};
    sink.addRenderedQuad("key", "name", "image", png, 0xffffff, 1, 0, 1, positions.clone(), uv, 1);
    RenderedLayer.separate(positions, 1);
    legacy.addQuad("key", "name", "image", png, 0xffffff, 1, 0, 1, positions, uv);
    sink.addPointLight(0, 2, 0, 0xffffff, 15);
    legacy.addPointLight(0, 2, 0, 0xffffff, 15);
    assertTrue(sink.hasGeometry());
    assertEquals(1, sink.materialCount());
    Path actual = directory.resolve("sink.glb"), expected = directory.resolve("legacy.glb");
    sink.write(actual);
    legacy.write(expected);
    assertArrayEquals(Files.readAllBytes(expected), Files.readAllBytes(actual));
  }
}
