package dev.minemories.neoforge;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Base64;

final class CaptureIcon {
  static final int MAX_BYTES = 128 * 1024;
  private static final int MAX_DIMENSION = 512;
  private static final byte[] PNG = {(byte) 137, 80, 78, 71, 13, 10, 26, 10};

  private CaptureIcon() {}

  static String read(Path file) throws IOException {
    if (!Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS))
      throw new IOException("World icon is not a regular file");
    try (var input = Files.newInputStream(file, LinkOption.NOFOLLOW_LINKS)) {
      byte[] bytes = input.readNBytes(MAX_BYTES + 1);
      if (bytes.length > MAX_BYTES) throw new IOException("World icon exceeds the capture budget");
      return encode(bytes);
    }
  }

  static String encode(byte[] bytes) {
    if (bytes == null
        || bytes.length < 33
        || bytes.length > MAX_BYTES
        || !Arrays.equals(PNG, 0, PNG.length, bytes, 0, PNG.length)) return null;
    var header = ByteBuffer.wrap(bytes);
    if (header.getInt(8) != 13 || header.getInt(12) != 0x49484452) return null;
    int width = header.getInt(16), height = header.getInt(20);
    if (width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION) return null;
    return "data:image/png;base64," + Base64.getEncoder().encodeToString(bytes);
  }
}
