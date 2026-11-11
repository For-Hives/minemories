package dev.minemories.client;

import com.google.gson.JsonObject;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Objects;

/** Versioned private world/footprint identities; names and proximity are never sequence keys. */
final class CaptureIdentity {
  private CaptureIdentity() {}

  static String world(String world, String seed, String dimension, String player) {
    return hash(
        "minemories-world-v1",
        Objects.requireNonNull(world),
        seed,
        Objects.requireNonNull(dimension),
        Objects.requireNonNull(player));
  }

  static String remote(
      String server, String dimension, String player, String namespace, boolean configured) {
    return hash(
        "minemories-remote-world-v1",
        Objects.requireNonNull(server),
        configured ? "namespace" : "session",
        Objects.requireNonNull(namespace),
        Objects.requireNonNull(dimension),
        Objects.requireNonNull(player));
  }

  /**
   * Current remote identity: the server is canonical ({@link #canonicalServer}) and the namespace
   * is the persistent per-server UUID, so every session on one server lands in one stack.
   */
  static String remoteV2(String server, String dimension, String player, String namespace) {
    return hash(
        "minemories-remote-world-v2",
        Objects.requireNonNull(server),
        Objects.requireNonNull(namespace),
        Objects.requireNonNull(dimension),
        Objects.requireNonNull(player));
  }

  /**
   * The same server reached as {@code Example.com}, {@code example.com.} or {@code
   * example.com:25565} is one server; the Minecraft default port is dropped.
   */
  static String canonicalServer(String address) {
    String value = Objects.requireNonNull(address).strip().toLowerCase(java.util.Locale.ROOT);
    int colon = value.lastIndexOf(':');
    boolean bracketed = value.startsWith("[");
    boolean hasPort =
        bracketed ? value.indexOf(']') < colon : colon >= 0 && value.indexOf(':') == colon;
    String host = hasPort ? value.substring(0, colon) : value;
    String port = hasPort ? value.substring(colon + 1) : "";
    while (host.endsWith(".")) host = host.substring(0, host.length() - 1);
    return port.isEmpty() || port.equals("25565") ? host : host + ":" + port;
  }

  static String remoteSettingsKeyV2(String canonicalServer) {
    return "remoteWorld2."
        + hash("minemories-remote-settings-v2", Objects.requireNonNull(canonicalServer));
  }

  static String remoteSettingsKey(String server) {
    return "remoteWorld." + hash("minemories-remote-settings-v1", Objects.requireNonNull(server));
  }

  static String zone(String worldId, CaptureBounds bounds, boolean selection) {
    return hash(
        "minemories-zone-v1",
        worldId,
        selection ? "selection" : "around",
        Integer.toString(bounds.minX()),
        Integer.toString(bounds.maxX()),
        Integer.toString(bounds.minZ()),
        Integer.toString(bounds.maxZ()),
        selection ? Integer.toString(bounds.minY()) : null,
        selection ? Integer.toString(bounds.maxY()) : null);
  }

  static void geometry(JsonObject metadata, CaptureBounds bounds) {
    var volume = new JsonObject();
    volume.addProperty("minX", bounds.minX());
    volume.addProperty("minY", bounds.minY());
    volume.addProperty("minZ", bounds.minZ());
    volume.addProperty("maxX", bounds.maxX());
    volume.addProperty("maxY", bounds.maxY());
    volume.addProperty("maxZ", bounds.maxZ());
    var origin = new JsonObject();
    origin.addProperty("x", (int) (((long) bounds.minX() + bounds.maxX()) / 2));
    origin.addProperty("y", (int) (((long) bounds.minY() + bounds.maxY()) / 2));
    origin.addProperty("z", (int) (((long) bounds.minZ() + bounds.maxZ()) / 2));
    metadata.add("captureBounds", volume);
    metadata.add("captureOrigin", origin);
  }

  private static String hash(String... fields) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      ByteBuffer length = ByteBuffer.allocate(4);
      for (String field : fields) {
        digest.update((byte) (field == null ? 0 : 1));
        if (field == null) continue;
        if (field.length() > 16384)
          throw new IllegalArgumentException("Capture identity field is too long");
        byte[] bytes = field.getBytes(StandardCharsets.UTF_8);
        length.putInt(0, bytes.length);
        digest.update(length.array());
        digest.update(bytes);
      }
      return HexFormat.of().formatHex(digest.digest());
    } catch (NoSuchAlgorithmException error) {
      throw new IllegalStateException("SHA-256 unavailable", error);
    }
  }
}
