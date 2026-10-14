package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CaptureIconTest {
  @TempDir Path directory;

  private static byte[] png() throws IOException {
    var output = new ByteArrayOutputStream();
    assertTrue(
        ImageIO.write(new BufferedImage(64, 64, BufferedImage.TYPE_INT_ARGB), "png", output));
    return output.toByteArray();
  }

  @Test
  void regularMinecraftIconIsEmbeddedButExternalLinksAndOversizedFilesAreRefused()
      throws Exception {
    Path file = directory.resolve("icon.png");
    Files.write(file, png());
    assertEquals(CaptureIcon.encode(Files.readAllBytes(file)), CaptureIcon.read(file));
    Path link = directory.resolve("linked.png");
    Files.createSymbolicLink(link, file);
    assertThrows(IOException.class, () -> CaptureIcon.read(link));
    assertThrows(IOException.class, () -> CaptureIcon.read(directory));
    Files.write(file, new byte[CaptureIcon.MAX_BYTES + 1]);
    assertThrows(IOException.class, () -> CaptureIcon.read(file));
  }

  @Test
  void ServerAndWorldIconsCannotSmuggleArbitraryBytesOrOversizedDimensions() throws Exception {
    assertNull(CaptureIcon.encode(null));
    assertNull(CaptureIcon.encode(new byte[0]));
    assertNull(CaptureIcon.encode(new byte[33]));
    assertNull(CaptureIcon.encode(new byte[CaptureIcon.MAX_BYTES + 1]));
    byte[] data = png();
    ByteBuffer header = ByteBuffer.wrap(data);
    header.putInt(8, 12);
    assertNull(CaptureIcon.encode(data));
    header.putInt(8, 13).putInt(12, 0);
    assertNull(CaptureIcon.encode(data));
    header.putInt(12, 0x49484452).putInt(16, 0);
    assertNull(CaptureIcon.encode(data));
    header.putInt(16, 64).putInt(20, 0);
    assertNull(CaptureIcon.encode(data));
    header.putInt(20, 64).putInt(16, 513);
    assertNull(CaptureIcon.encode(data));
    header.putInt(16, 64).putInt(20, 513);
    assertNull(CaptureIcon.encode(data));
    assertNotNull(CaptureIcon.encode(png()));
  }
}
