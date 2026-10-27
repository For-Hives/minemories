package dev.minemories.core;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/** Single-file `.mmtiles` container: a header, the manifest, then the tile GLBs in order. */
public final class TileBundle {
  public static final int VERSION = 1;
  private static final byte[] MAGIC = "MMTB".getBytes(StandardCharsets.US_ASCII);

  private TileBundle() {}

  public static byte[] header(TileManifest manifest) {
    byte[] json = manifest.toJson().getBytes(StandardCharsets.UTF_8);
    int paddedLength = (json.length + 3) & ~3;
    ByteBuffer header = ByteBuffer.allocate(12 + paddedLength).order(ByteOrder.LITTLE_ENDIAN);
    header.put(MAGIC).putInt(VERSION).putInt(paddedLength).put(json);
    while (header.hasRemaining()) header.put((byte) 0x20);
    return header.array();
  }

  public static void write(Path output, TileManifest manifest, Path tilesDirectory)
      throws IOException {
    Path parent = output.toAbsolutePath().getParent();
    if (parent == null) throw new IOException("The bundle output has no parent directory.");
    Files.createDirectories(parent);
    Path temp = Files.createTempFile(parent, "mmtiles-", ".tmp");
    try {
      try (OutputStream out = Files.newOutputStream(temp)) {
        out.write(header(manifest));
        long expectedOffset = 0;
        for (TileManifest.Entry entry : manifest.tiles()) {
          byte[] bytes = tileBytes(tilesDirectory, entry, expectedOffset);
          out.write(bytes);
          expectedOffset += bytes.length;
        }
      }
      Files.move(temp, output, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
    } catch (IOException | RuntimeException failure) {
      deleteQuietly(temp, failure);
      throw failure;
    }
  }

  private static byte[] tileBytes(Path tilesDirectory, TileManifest.Entry entry, long offset)
      throws IOException {
    if (!entry.file().equals(TileManifest.fileName(entry.x(), entry.z())))
      throw new IOException("Tile file name does not match its coordinates: " + entry.file());
    if (entry.offset() != offset)
      throw new IOException("Tile offset does not match the bundle layout: " + entry.file());
    byte[] bytes = Files.readAllBytes(tilesDirectory.resolve(entry.file()));
    if (bytes.length != entry.size())
      throw new IOException("Tile size does not match the manifest: " + entry.file());
    if (!TileManifest.sha256(bytes).equals(entry.sha256()))
      throw new IOException("Tile checksum does not match the manifest: " + entry.file());
    return bytes;
  }

  private static void deleteQuietly(Path temp, Exception failure) {
    try {
      Files.deleteIfExists(temp);
    } catch (IOException cleanup) {
      failure.addSuppressed(cleanup);
    }
  }
}
