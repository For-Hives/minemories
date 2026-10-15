package dev.minemories.client;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** One block/entity's copied output. A renderer cannot yield mid-call, so admission is bounded. */
final class CaptureElement implements CaptureSink {
  static final long MAX_BYTES = 2L * 1024 * 1024;
  static final int MAX_QUADS = 8192;

  record Material(
      String key, String name, String image, int tint, int alpha, float emission, float opacity) {}

  record Light(float x, float y, float z, int color, int level) {}

  static final class Quad {
    private final Material material;
    private final float[] positions;
    private final float[] uvs;
    private final int layer;

    private Quad(Material material, float[] positions, float[] uvs, int layer) {
      this.material = material;
      this.positions = positions.clone();
      this.uvs = uvs.clone();
      this.layer = layer;
    }

    Material material() {
      return material;
    }

    float[] positions() {
      return positions.clone();
    }

    float[] uvs() {
      return uvs.clone();
    }

    int layer() {
      return layer;
    }
  }

  record Snapshot(List<Quad> quads, List<Light> lights, long chargedBytes) {
    Snapshot {
      quads = List.copyOf(quads);
      lights = List.copyOf(lights);
    }
  }

  private final List<Quad> quads = new ArrayList<>();
  private final List<Light> lights = new ArrayList<>();
  private final Map<String, Material> materials = new LinkedHashMap<>();
  private long bytes;
  private int attempted;
  private boolean sealed;
  private boolean failed;

  @Override
  public void addQuad(
      String key,
      String name,
      String image,
      byte[] png,
      int tint,
      int alpha,
      float emission,
      float opacity,
      float[] xyz,
      float[] uv)
      throws IOException {
    addRenderedQuad(key, name, image, png, tint, alpha, emission, opacity, xyz, uv, 0);
  }

  @Override
  public void addRenderedQuad(
      String key,
      String name,
      String image,
      byte[] png,
      int tint,
      int alpha,
      float emission,
      float opacity,
      float[] xyz,
      float[] uv,
      int layer)
      throws IOException {
    writable();
    try {
      copyQuad(key, name, image, tint, alpha, emission, opacity, xyz, uv, layer);
    } catch (IOException error) {
      failed = true;
      throw error;
    }
  }

  private void copyQuad(
      String key,
      String name,
      String image,
      int tint,
      int alpha,
      float emission,
      float opacity,
      float[] xyz,
      float[] uv,
      int layer)
      throws IOException {
    if (++attempted > MAX_QUADS)
      throw new IOException("Le modèle dépasse la limite de primitives.");
    if (xyz.length != 12 || uv.length != 8) throw new IllegalArgumentException("Expected a quad");
    for (float value : xyz) if (!Float.isFinite(value)) return;
    for (float value : uv) if (!Float.isFinite(value)) return;
    if (quads.size() == MAX_QUADS)
      throw new IOException("Le modèle dépasse la limite de primitives.");
    Material material = materials.get(key);
    if (material == null) {
      reserve(512L + 2L * (textBytes(key) + textBytes(name) + textBytes(image)));
      material = new Material(key, name, image, tint, alpha, emission, opacity);
      materials.put(key, material);
    }
    // Charge object/array/list overhead conservatively, independently of GC or array compression.
    reserve(256);
    quads.add(new Quad(material, xyz, uv, layer));
  }

  @Override
  public void addPointLight(float x, float y, float z, int color, int level) throws IOException {
    writable();
    if (level < 4 || !Float.isFinite(x) || !Float.isFinite(y) || !Float.isFinite(z)) return;
    reserve(64);
    lights.add(new Light(x, y, z, color, level));
  }

  private static int textBytes(String value) throws IOException {
    Objects.requireNonNull(value);
    if (value.length() > 4096) throw new IOException("Descripteur du modèle trop long.");
    int length = value.getBytes(StandardCharsets.UTF_8).length;
    if (length > 4096) throw new IOException("Descripteur du modèle trop long.");
    return length;
  }

  private void reserve(long amount) throws IOException {
    if (amount > MAX_BYTES - bytes) {
      failed = true;
      throw new IOException("Le modèle dépasse le budget de copie.");
    }
    bytes += amount;
  }

  private void writable() {
    if (sealed || failed) throw new IllegalStateException("Captured element sealed or invalid");
  }

  Snapshot seal() {
    writable();
    sealed = true;
    return new Snapshot(quads, lights, bytes);
  }

  @Override
  public boolean hasGeometry() {
    return !failed && !quads.isEmpty();
  }

  @Override
  public int materialCount() {
    return materials.size();
  }

  @Override
  public void write(Path output) {
    throw new IllegalStateException("Element is not a scene");
  }
}
