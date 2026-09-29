package dev.minemories.core;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Loader-independent GLB scene builder. All inputs are plain copied data. */
public final class GlbScene {
  private final Map<String, Part> parts = new LinkedHashMap<>();
  private final Map<String, PointLight> pointLights = new LinkedHashMap<>();

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
    if (xyz.length != 12 || uv.length != 8)
      throw new IllegalArgumentException("Expected 4 xyz and uv vertices");
    // Some modded block entity renderers emit non-finite vertices for
    // unsupported/partially initialized models. Never serialize those into glTF.
    for (float value : xyz) if (!Float.isFinite(value)) return;
    for (float value : uv) if (!Float.isFinite(value)) return;
    float safeEmission = Float.isFinite(emission) ? emission : 0;
    float safeOpacity = Float.isFinite(opacity) ? opacity : 1;
    Part part =
        parts.computeIfAbsent(
            key,
            ignored ->
                new Part(materialName, imageKey, png, tint, alphaMode, safeEmission, safeOpacity));
    part.addQuad(xyz, uv);
  }

  public int materialCount() {
    return parts.size();
  }

  public void addPointLight(float x, float y, float z, int color, int level) {
    if (level < 4
        || pointLights.size() >= 128
        || !Float.isFinite(x)
        || !Float.isFinite(y)
        || !Float.isFinite(z)) return;
    String key = Math.round(x * 2) + ":" + Math.round(y * 2) + ":" + Math.round(z * 2);
    pointLights.putIfAbsent(key, new PointLight(x, y, z, color, level));
  }

  public void write(Path output) throws IOException {
    ByteArrayOutputStream binary = new ByteArrayOutputStream();
    List<String> views = new ArrayList<>(),
        accessors = new ArrayList<>(),
        primitives = new ArrayList<>();
    List<String> materials = new ArrayList<>(),
        images = new ArrayList<>(),
        textures = new ArrayList<>();
    Map<String, Integer> imageIndices = new LinkedHashMap<>();
    int materialIndex = 0;
    for (Part part : parts.values()) {
      int pos =
          accessor(
              binary,
              views,
              accessors,
              part.positions.toByteArray(),
              34962,
              5126,
              part.vertices,
              "VEC3",
              part.min,
              part.max);
      int normal =
          accessor(
              binary,
              views,
              accessors,
              part.normals.toByteArray(),
              34962,
              5126,
              part.vertices,
              "VEC3",
              null,
              null);
      int uv =
          accessor(
              binary,
              views,
              accessors,
              part.uvs.toByteArray(),
              34962,
              5126,
              part.vertices,
              "VEC2",
              null,
              null);
      int indices =
          accessor(
              binary,
              views,
              accessors,
              part.indices.toByteArray(),
              34963,
              5125,
              part.indexCount,
              "SCALAR",
              null,
              null);
      primitives.add(
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
              + ",\"mode\":4}");
      Integer texture = imageIndices.get(part.imageKey);
      if (texture == null) {
        align(binary);
        int offset = binary.size();
        binary.write(part.png);
        int view = views.size();
        views.add(
            "{\"buffer\":0,\"byteOffset\":" + offset + ",\"byteLength\":" + part.png.length + "}");
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
    nodes.add("{\"mesh\":0}");
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
        lights.isEmpty()
            ? ""
            : ",\"extensionsUsed\":[\"KHR_lights_punctual\"],\"extensions\":{\"KHR_lights_punctual\":{\"lights\":["
                + String.join(",", lights)
                + "]}}";
    String json =
        "{\"asset\":{\"version\":\"2.0\",\"generator\":\"Memory POC core\"},\"scene\":0,\"scenes\":[{\"nodes\":["
            + indices(nodes.size())
            + "]}],\"nodes\":["
            + String.join(",", nodes)
            + "],\"meshes\":[{\"primitives\":["
            + String.join(",", primitives)
            + "]}],\"materials\":["
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
      float[] min,
      float[] max)
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
            + ",\"target\":"
            + target
            + "}");
    String bounds = min == null ? "" : ",\"min\":" + vec(min) + ",\"max\":" + vec(max);
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
            + bounds
            + "}");
    return result;
  }

  private static final class Part {
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
    int vertices, indexCount;

    Part(
        String name,
        String imageKey,
        byte[] png,
        int tint,
        int alphaMode,
        float emission,
        float opacity) {
      this.name = name;
      this.imageKey = imageKey;
      this.png = png;
      this.tint = tint;
      this.alphaMode = alphaMode;
      this.emission = emission;
      this.opacity = opacity;
    }

    void addQuad(float[] p, float[] uv) {
      float ax = p[3] - p[0],
          ay = p[4] - p[1],
          az = p[5] - p[2],
          bx = p[6] - p[0],
          by = p[7] - p[1],
          bz = p[8] - p[2];
      float nx = ay * bz - az * by,
          ny = az * bx - ax * bz,
          nz = ax * by - ay * bx,
          len = (float) Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0) {
        nx /= len;
        ny /= len;
        nz /= len;
      }
      for (int i = 0; i < 4; i++) {
        float x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
        f(positions, x);
        f(positions, y);
        f(positions, z);
        f(normals, nx);
        f(normals, ny);
        f(normals, nz);
        f(uvs, uv[i * 2]);
        f(uvs, uv[i * 2 + 1]);
        min[0] = Math.min(min[0], x);
        min[1] = Math.min(min[1], y);
        min[2] = Math.min(min[2], z);
        max[0] = Math.max(max[0], x);
        max[1] = Math.max(max[1], y);
        max[2] = Math.max(max[2], z);
      }
      int base = vertices;
      i(indices, base);
      i(indices, base + 1);
      i(indices, base + 2);
      i(indices, base);
      i(indices, base + 2);
      i(indices, base + 3);
      vertices += 4;
      indexCount += 6;
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
    return s.replace("\\", "\\\\").replace("\"", "\\\"");
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
