package dev.minemories.core;

import java.io.IOException;

/** Exact index packing; glTF reserves each unsigned type's maximum value for primitive restart. */
final class GlbIndices {
  private GlbIndices() {}

  static int width(int vertices) {
    if (vertices <= 255) return 1;
    if (vertices <= 65535) return 2;
    return 4;
  }

  static int componentType(int vertices) {
    return switch (width(vertices)) {
      case 1 -> 5121;
      case 2 -> 5123;
      default -> 5125;
    };
  }

  /**
   * Compacts a whole number of little-endian uint32 indices in place, using bounded caller storage.
   */
  static int compact(byte[] buffer, int length, int width) throws IOException {
    if (length < 0 || length > buffer.length || length % 4 != 0 || (width != 1 && width != 2))
      throw new IllegalArgumentException("Invalid index buffer layout");
    int maximum = width == 1 ? 255 : 65535;
    int output = 0;
    for (int index = 0; index < length; index += 4) {
      int value =
          (buffer[index] & 255)
              | ((buffer[index + 1] & 255) << 8)
              | ((buffer[index + 2] & 255) << 16)
              | ((buffer[index + 3] & 255) << 24);
      if (value < 0 || value >= maximum)
        throw new IOException("Index exceeds selected GLB component type");
      buffer[output++] = buffer[index];
      if (width == 2) buffer[output++] = buffer[index + 1];
    }
    return output;
  }
}
