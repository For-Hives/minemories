package dev.minemories.core;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Loader-independent GLB scene builder. All inputs are plain copied data. */
public final class GlbScene {
  /** Marks quads whose chunk is unknown: the primitive then publishes no chunk ranges. */
  public static final int NO_CHUNK = ChunkRuns.NONE;

  private String playerExtras = "";

  /** Local player feet, relative to the exported origin. No world coordinates are embedded. */
  public void setPlayerPosition(double x, double y, double z) {
    if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)) return;
    playerExtras = ",\"extras\":{\"minemoriesPlayerPosition\":[" + x + "," + y + "," + z + "]}";
  }

  private final Map<String, Part> parts = new LinkedHashMap<>();
  private final VertexCache cache = new VertexCache();
  private final ChunkStats stats = new ChunkStats();
  private final ChunkRuns.Budget runBudget = new ChunkRuns.Budget();
  private final GlbMetadata metadata = new GlbMetadata();
  private final int[] quadsByCategory = new int[GlbCategory.values().length];
  private final Map<String, AtlasTexture.Usage> atlasUsage = new LinkedHashMap<>();
  private final Map<String, PointLight> pointLights = new LinkedHashMap<>();

  /** Non-personal technical description written into {@code asset.extras.minemories}. */
  public void setSource(String minecraft, String loader, String mod, String dimension) {
    metadata.setSource(minecraft, loader, mod, dimension);
  }

  public void addQuad(
      String key,
      String materialName,
      String imageKey,
      byte[] png,
      int tint,
      int alphaMode,
      float emission,
      float opacity,
      float[] xyz,
      float[] uv) {
    addQuad(
        GlbCategory.TERRAIN,
        ChunkRuns.NONE,
        ChunkRuns.NONE,
        key,
        materialName,
        imageKey,
        png,
        tint,
        alphaMode,
        emission,
        opacity,
        xyz,
        uv);
  }

  /** Chunk coordinates are relative to the chunk holding the capture origin, or NONE. */
  public void addQuad(
      GlbCategory category,
      int chunkX,
      int chunkZ,
      String key,
      String materialName,
      String imageKey,
      byte[] png,
      int tint,
      int alphaMode,
      float emission,
      float opacity,
      float[] xyz,
      float[] uv) {
    if (xyz.length != 12 || uv.length != 8)
      throw new IllegalArgumentException("Expected 4 xyz and uv vertices");
    // Some modded block entity renderers emit non-finite vertices for
    // unsupported/partially initialized models. Never serialize those into glTF.
    for (float value : xyz) if (!Float.isFinite(value)) return;
    for (float value : uv) if (!Float.isFinite(value)) return;
    float[] normal = new float[3];
    // A quad without any area renders nothing: it is dropped rather than written with a zero
    // normal.
    if (!QuadGeometry.normal(xyz, normal)) return;
    float safeEmission = Float.isFinite(emission) ? emission : 0;
    float safeOpacity = Float.isFinite(opacity) ? opacity : 1;
    Part part =
        parts.computeIfAbsent(
            category.ordinal() + ":" + key,
            ignored ->
                new Part(
                    parts.size(),
                    category,
                    new ChunkRuns(runBudget),
                    materialName,
                    imageKey,
                    png,
                    tint,
                    alphaMode,
                    safeEmission,
                    safeOpacity));
    atlasUsage.computeIfAbsent(part.imageKey, AtlasTexture.Usage::new).include(uv);
    stats.quad(category, chunkX, chunkZ, materialName, xyz);
    int before = part.indexCount / 3;
    part.addQuad(cache, xyz, uv, normal);
    part.runs.record(chunkX, chunkZ, before, part.indexCount / 3);
    quadsByCategory[category.ordinal()]++;
  }

  /** Per-chunk facts of everything added so far. */
  public ChunkStats chunkStats() {
    return stats;
  }

  public int materialCount() {
    return parts.size();
  }

  public boolean hasGeometry() {
    return !parts.isEmpty();
  }

  public void addPointLight(float x, float y, float z, int color, int level) {
    addPointLight(x, y, z, color, level, NO_CHUNK, NO_CHUNK);
  }

  /** The chunk, relative to the capture origin, is only used for per-chunk statistics. */
  public void addPointLight(
      float x, float y, float z, int color, int level, int chunkX, int chunkZ) {
    if (level < 4
        || pointLights.size() >= 128
        || !Float.isFinite(x)
        || !Float.isFinite(y)
        || !Float.isFinite(z)) return;
    String key = Math.round(x * 2) + ":" + Math.round(y * 2) + ":" + Math.round(z * 2);
    if (pointLights.putIfAbsent(key, new PointLight(x, y, z, color, level)) == null) {
      stats.light(chunkX, chunkZ);
    }
  }

  public void write(Path output) throws IOException {
    if (!hasGeometry()) throw new IOException("The capture contains no renderable geometry.");
    ByteArrayOutputStream binary = new ByteArrayOutputStream();
    List<String> views = new ArrayList<>(),
        accessors = new ArrayList<>(),
        meshes = new ArrayList<>();
    Map<GlbCategory, List<String>> byCategory = new EnumMap<>(GlbCategory.class);
    List<String> materials = new ArrayList<>(),
        images = new ArrayList<>(),
        textures = new ArrayList<>();
    Map<String, Integer> imageIndices = new LinkedHashMap<>();
    int materialIndex = 0;
    Map<GlbCategory, Quantization.Plan> plans = quantizationPlans();
    Map<String, byte[]> repacked = repackAtlases();
    for (Part part : parts.values()) {
      Quantization.Plan plan = plans.get(part.category);
      byte[] positionBytes =
          plan == null
              ? part.positions.toByteArray()
              : quantize(
                  0,
                  part.positions.toByteArray(),
                  part.vertices * Quantization.POSITION,
                  plan,
                  null);
      byte[] normalBytes =
          quantize(1, part.normals.toByteArray(), part.vertices * Quantization.NORMAL, null, null);
      boolean packedUv = part.uvFits;
      byte[] uvBytes =
          packedUv
              ? quantize(
                  2,
                  part.uvs.toByteArray(),
                  part.vertices * Quantization.UV,
                  null,
                  part.uvTransform)
              : part.uvs.toByteArray();
      int pos =
          accessor(
              binary,
              views,
              accessors,
              positionBytes,
              34962,
              plan == null ? 5126 : 5122,
              part.vertices,
              "VEC3",
              plan == null
                  ? ",\"min\":" + vec(part.min) + ",\"max\":" + vec(part.max)
                  : ",\"min\":" + ints(part.min, plan) + ",\"max\":" + ints(part.max, plan),
              plan == null ? 0 : Quantization.POSITION);
      int normal =
          accessor(
              binary,
              views,
              accessors,
              normalBytes,
              34962,
              5120,
              part.vertices,
              "VEC3",
              ",\"normalized\":true",
              Quantization.NORMAL);
      int uv =
          accessor(
              binary,
              views,
              accessors,
              uvBytes,
              34962,
              packedUv ? 5123 : 5126,
              part.vertices,
              "VEC2",
              packedUv ? ",\"normalized\":true" : "",
              packedUv ? Quantization.UV : 0);
      byte[] packedIndices = part.indices.toByteArray();
      int indexWidth = GlbIndices.width(part.vertices);
      if (indexWidth < 4) {
        packedIndices =
            Arrays.copyOf(
                packedIndices, GlbIndices.compact(packedIndices, packedIndices.length, indexWidth));
      }
      int indices =
          accessor(
              binary,
              views,
              accessors,
              packedIndices,
              34963,
              GlbIndices.componentType(part.vertices),
              part.indexCount,
              "SCALAR",
              "",
              0);
      String ranges = part.runs.json();
      byCategory
          .computeIfAbsent(part.category, ignored -> new ArrayList<>())
          .add(
              "{\"attributes\":{\"POSITION\":"
                  + pos
                  + ",\"NORMAL\":"
                  + normal
                  + ",\"TEXCOORD_0\":"
                  + uv
                  + "},\"indices\":"
                  + indices
                  + ",\"material\":"
                  + materialIndex
                  + ",\"mode\":4"
                  + (ranges == null ? "" : ",\"extras\":{\"minemoriesChunks\":" + ranges + "}")
                  + "}");
      Integer texture = imageIndices.get(part.imageKey);
      if (texture == null) {
        align(binary);
        int offset = binary.size();
        byte[] png =
            repacked.containsKey(part.imageKey)
                ? repacked.get(part.imageKey)
                : atlasUsage.get(part.imageKey).optimize(part.png);
        binary.write(png);
        int view = views.size();
        views.add("{\"buffer\":0,\"byteOffset\":" + offset + ",\"byteLength\":" + png.length + "}");
        int image = images.size();
        images.add(
            "{\"name\":\""
                + esc(part.imageKey)
                + "\",\"bufferView\":"
                + view
                + ",\"mimeType\":\"image/png\"}");
        texture = textures.size();
        textures.add("{\"sampler\":0,\"source\":" + image + "}");
        imageIndices.put(part.imageKey, texture);
      }
      float r = ((part.tint >>> 16) & 255) / 255f,
          g = ((part.tint >>> 8) & 255) / 255f,
          b = (part.tint & 255) / 255f;
      String alpha =
          part.alphaMode == 2
              ? ",\"alphaMode\":\"BLEND\""
              : part.alphaMode == 1 ? ",\"alphaMode\":\"MASK\",\"alphaCutoff\":0.5" : "";
      // Reuse the block sprite as the emissive map. Without this, glTF treats
      // emissiveFactor as a solid, untextured glow and washes detailed sprites out.
      String emissive =
          part.emission > 0
              ? ",\"emissiveFactor\":["
                  + (r * part.emission * 0.65f)
                  + ","
                  + (g * part.emission * 0.65f)
                  + ","
                  + (b * part.emission * 0.65f)
                  + "],\"emissiveTexture\":{\"index\":"
                  + texture
                  + "}"
              : "";
      materials.add(
          "{\"name\":\""
              + esc(part.name)
              + "\",\"pbrMetallicRoughness\":{\"baseColorFactor\":["
              + r
              + ","
              + g
              + ","
              + b
              + ","
              + part.opacity
              + "],\"baseColorTexture\":{\"index\":"
              + texture
              + "},\"metallicFactor\":0,\"roughnessFactor\":1},\"doubleSided\":true"
              + alpha
              + emissive
              + "}");
      materialIndex++;
    }
    List<String> nodes = new ArrayList<>();
    for (GlbCategory category : GlbCategory.values()) {
      List<String> group = byCategory.get(category);
      if (group == null) continue;
      nodes.add(
          "{\"name\":\""
              + category.id()
              + "\""
              + Quantization.transform(plans.get(category))
              + ",\"mesh\":"
              + meshes.size()
              + "}");
      meshes.add(
          "{\"name\":\"" + category.id() + "\",\"primitives\":[" + String.join(",", group) + "]}");
    }
    List<String> lights = new ArrayList<>();
    for (PointLight light : pointLights.values()) {
      int id = lights.size();
      float r = ((light.color >>> 16) & 255) / 255f,
          g = ((light.color >>> 8) & 255) / 255f,
          b = (light.color & 255) / 255f;
      // KHR_lights_punctual uses candela. The previous 2 cd per Minecraft
      // light level was barely visible after Blender's glTF import and scene exposure.
      lights.add(
          "{\"type\":\"point\",\"color\":["
              + r
              + ","
              + g
              + ","
              + b
              + "],\"intensity\":"
              + (light.level * 100.0f)
              + ",\"range\":"
              + Math.max(12, light.level * 1.5f)
              + "}");
      nodes.add(
          "{\"translation\":["
              + light.x
              + ","
              + light.y
              + ","
              + light.z
              + "],\"extensions\":{\"KHR_lights_punctual\":{\"light\":"
              + id
              + "}}}");
    }
    String lightExtension =
        Quantization.extensions(!lights.isEmpty())
            + (lights.isEmpty()
                ? ""
                : ",\"extensions\":{\"KHR_lights_punctual\":{\"lights\":["
                    + String.join(",", lights)
                    + "]}}");
    String json =
        "{\"asset\":"
            + metadata.assetJson(quadsByCategory)
            + ",\"scene\":0,\"scenes\":[{\"nodes\":["
            + indices(nodes.size())
            + "]"
            + playerExtras
            + "}],\"nodes\":["
            + String.join(",", nodes)
            + "],\"meshes\":["
            + String.join(",", meshes)
            + "],\"materials\":["
            + String.join(",", materials)
            + "],\"textures\":["
            + String.join(",", textures)
            + "],\"images\":["
            + String.join(",", images)
            + "],\"samplers\":[{\"magFilter\":9728,\"minFilter\":9728,\"wrapS\":10497,\"wrapT\":10497}],\"accessors\":["
            + String.join(",", accessors)
            + "],\"bufferViews\":["
            + String.join(",", views)
            + "],\"buffers\":[{\"byteLength\":"
            + binary.size()
            + "}]"
            + lightExtension
            + "}";
    byte[] jsonBytes = json.getBytes(StandardCharsets.UTF_8), bin = binary.toByteArray();
    int jsonLength = align4(jsonBytes.length),
        binLength = align4(bin.length),
        total = 12 + 8 + jsonLength + 8 + binLength;
    ByteBuffer glb = ByteBuffer.allocate(total).order(ByteOrder.LITTLE_ENDIAN);
    glb.putInt(0x46546C67)
        .putInt(2)
        .putInt(total)
        .putInt(jsonLength)
        .putInt(0x4E4F534A)
        .put(jsonBytes);
    while (glb.position() < 20 + jsonLength) glb.put((byte) 0x20);
    glb.putInt(binLength).putInt(0x004E4942).put(bin);
    while (glb.hasRemaining()) glb.put((byte) 0);
    Path parent = output.toAbsolutePath().getParent();
    if (parent != null) Files.createDirectories(parent);
    Files.write(output, glb.array());
  }

  private static int accessor(
      ByteArrayOutputStream binary,
      List<String> views,
      List<String> accessors,
      byte[] data,
      int target,
      int component,
      int count,
      String type,
      String extra,
      int stride)
      throws IOException {
    align(binary);
    int offset = binary.size();
    binary.write(data);
    int view = views.size();
    views.add(
        "{\"buffer\":0,\"byteOffset\":"
            + offset
            + ",\"byteLength\":"
            + data.length
            + (stride == 0 ? "" : ",\"byteStride\":" + stride)
            + ",\"target\":"
            + target
            + "}");
    int result = accessors.size();
    accessors.add(
        "{\"bufferView\":"
            + view
            + ",\"componentType\":"
            + component
            + ",\"count\":"
            + count
            + ",\"type\":\""
            + type
            + "\""
            + extra
            + "}");
    return result;
  }

  private Map<GlbCategory, Quantization.Plan> quantizationPlans() {
    Map<GlbCategory, float[][]> extents = new EnumMap<>(GlbCategory.class);
    for (Part part : parts.values()) {
      float[][] extent =
          extents.computeIfAbsent(
              part.category,
              ignored ->
                  new float[][] {
                    {Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY},
                    {Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY}
                  });
      for (int axis = 0; axis < 3; axis++) {
        extent[0][axis] = Math.min(extent[0][axis], part.min[axis]);
        extent[1][axis] = Math.max(extent[1][axis], part.max[axis]);
      }
    }
    Map<GlbCategory, Quantization.Plan> plans = new EnumMap<>(GlbCategory.class);
    extents.forEach(
        (category, extent) -> {
          Quantization.Plan plan = Quantization.plan(extent[0], extent[1]);
          if (plan != null) plans.put(category, plan);
        });
    return plans;
  }

  private static byte[] quantize(
      int kind, byte[] floats, int size, Quantization.Plan plan, double[] uvTransform) {
    byte[] out = new byte[size];
    Quantization.convert(kind, floats, floats.length, out, plan, uvTransform);
    return out;
  }

  /** Repacks mostly unused atlases and remaps the UVs of their primitives; keyed by image. */
  private Map<String, byte[]> repackAtlases() throws IOException {
    Map<String, byte[]> result = new LinkedHashMap<>();
    for (Map.Entry<String, AtlasTexture.Usage> entry : atlasUsage.entrySet()) {
      String imageKey = entry.getKey();
      AtlasTexture.Usage usage = entry.getValue();
      if (!usage.candidate()) continue;
      List<Part> users = new ArrayList<>();
      for (Part part : parts.values()) if (part.imageKey.equals(imageKey)) users.add(part);
      byte[] png = users.get(0).png;
      int[] size = AtlasTexture.dimensions(png);
      if (size == null) continue;
      AtlasRepack.Plan plan =
          AtlasRepack.plan(
              png, size[0], size[1], users.stream().map(part -> part.uvBounds).toList());
      if (plan == null) continue;
      for (int index = 0; index < users.size(); index++) {
        users.get(index).uvTransform =
            new double[] {
              plan.scaleU(), plan.offsetU()[index], plan.scaleV(), plan.offsetV()[index]
            };
      }
      result.put(imageKey, plan.png());
    }
    return result;
  }

  private static String ints(float[] bound, Quantization.Plan plan) {
    return "["
        + plan.quantize(bound[0], plan.x())
        + ","
        + plan.quantize(bound[1], plan.y())
        + ","
        + plan.quantize(bound[2], plan.z())
        + "]";
  }

  private static final class Part {
    final int id;
    final GlbCategory category;
    final ChunkRuns runs;
    final String name, imageKey;
    final byte[] png;
    final int tint, alphaMode;
    final float emission, opacity;
    final ByteArrayOutputStream positions = new ByteArrayOutputStream(),
        normals = new ByteArrayOutputStream(),
        uvs = new ByteArrayOutputStream(),
        indices = new ByteArrayOutputStream();
    final float[] min = {Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY, Float.POSITIVE_INFINITY},
        max = {Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY, Float.NEGATIVE_INFINITY};
    private final float[] key = new float[8];
    private final int[] corners = new int[4];
    boolean uvFits = true;
    final UvBounds uvBounds = new UvBounds();
    double[] uvTransform;
    int vertices, indexCount;

    Part(
        int id,
        GlbCategory category,
        ChunkRuns runs,
        String name,
        String imageKey,
        byte[] png,
        int tint,
        int alphaMode,
        float emission,
        float opacity) {
      this.id = id;
      this.category = category;
      this.runs = runs;
      this.name = name;
      this.imageKey = imageKey;
      this.png = png;
      this.tint = tint;
      this.alphaMode = alphaMode;
      this.emission = emission;
      this.opacity = opacity;
    }

    void addQuad(VertexCache cache, float[] p, float[] uv, float[] normal) {
      for (int corner = 0; corner < 4; corner++) {
        QuadGeometry.corner(key, p, normal, uv, corner);
        int known = cache.intern(id, key, vertices);
        if (known < 0) {
          known = vertices++;
          for (int axis = 0; axis < 3; axis++) {
            f(positions, key[axis]);
            f(normals, key[3 + axis]);
            min[axis] = Math.min(min[axis], key[axis]);
            max[axis] = Math.max(max[axis], key[axis]);
          }
          f(uvs, key[6]);
          f(uvs, key[7]);
          uvFits = uvFits && Quantization.uvFits(key[6], key[7]);
          uvBounds.include(key[6], key[7]);
        }
        corners[corner] = known;
      }
      triangle(corners[0], corners[1], corners[2]);
      triangle(corners[0], corners[2], corners[3]);
    }

    private void triangle(int a, int b, int c) {
      // Welding can collapse a triangle of a quad that already had a repeated corner.
      if (a == b || b == c || a == c) return;
      i(indices, a);
      i(indices, b);
      i(indices, c);
      indexCount += 3;
    }
  }

  private record PointLight(float x, float y, float z, int color, int level) {}

  private static void f(ByteArrayOutputStream o, float v) {
    i(o, Float.floatToIntBits(v));
  }

  private static void i(ByteArrayOutputStream o, int v) {
    o.write(v & 255);
    o.write((v >>> 8) & 255);
    o.write((v >>> 16) & 255);
    o.write((v >>> 24) & 255);
  }

  private static void align(ByteArrayOutputStream o) {
    while ((o.size() & 3) != 0) o.write(0);
  }

  private static int align4(int n) {
    return (n + 3) & ~3;
  }

  private static String vec(float[] v) {
    return "[" + v[0] + "," + v[1] + "," + v[2] + "]";
  }

  private static String esc(String s) {
    StringBuilder escaped = new StringBuilder();
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i);
      if (c == '\\' || c == '"') escaped.append('\\');
      if (c < 0x20) {
        escaped.append(String.format("\\u%04x", (int) c));
      } else {
        escaped.append(c);
      }
    }
    return escaped.toString();
  }

  private static String indices(int count) {
    StringBuilder s = new StringBuilder();
    for (int i = 0; i < count; i++) {
      if (i > 0) s.append(',');
      s.append(i);
    }
    return s.toString();
  }
}
