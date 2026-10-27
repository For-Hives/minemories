package dev.minemories.core;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/** Routes capture quads and lights into world-anchored tiles, each written as its own GLB. */
public final class TiledGlbScene {
  private static final Comparator<TileKey> TILE_ORDER =
      Comparator.comparingInt(TileKey::x).thenComparingInt(TileKey::z);
  private static final Comparator<StoredQuad> QUAD_ORDER =
      Comparator.<StoredQuad, String>comparing(quad -> quad.key)
          .thenComparing(quad -> quad.materialName)
          .thenComparing(quad -> quad.imageKey)
          .thenComparingInt(quad -> quad.tint)
          .thenComparingInt(quad -> quad.alphaMode)
          .thenComparing((a, b) -> Float.compare(a.emission, b.emission))
          .thenComparing((a, b) -> Float.compare(a.opacity, b.opacity))
          .thenComparing((a, b) -> Arrays.compare(a.xyz, b.xyz))
          .thenComparing((a, b) -> Arrays.compare(a.uv, b.uv));
  private static final Comparator<StoredLight> LIGHT_ORDER =
      Comparator.comparing(StoredLight::x)
          .thenComparing(StoredLight::y)
          .thenComparing(StoredLight::z)
          .thenComparingInt(StoredLight::color)
          .thenComparingInt(StoredLight::level);

  private final TileGrid grid;
  private final int originX;
  private final int originY;
  private final int originZ;
  private final List<StoredQuad> quads = new ArrayList<>();
  private final List<StoredLight> lights = new ArrayList<>();

  public TiledGlbScene(TileGrid grid, int originX, int originY, int originZ) {
    this.grid = grid;
    this.originX = originX;
    this.originY = originY;
    this.originZ = originZ;
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
    if (xyz.length != 12 || uv.length != 8)
      throw new IllegalArgumentException("Expected 4 xyz and uv vertices");
    for (float value : xyz) if (!Float.isFinite(value)) return;
    for (float value : uv) if (!Float.isFinite(value)) return;
    TileKey tile;
    try {
      tile =
          tileOf(
              originX + ((double) xyz[0] + xyz[3] + xyz[6] + xyz[9]) / 4.0,
              originZ + ((double) xyz[2] + xyz[5] + xyz[8] + xyz[11]) / 4.0);
    } catch (IllegalArgumentException outOfRange) {
      return;
    }
    int minX = grid.minBlock(tile.x());
    int minZ = grid.minBlock(tile.z());
    float[] local = new float[12];
    for (int i = 0; i < 4; i++) {
      local[i * 3] = (float) ((double) originX + xyz[i * 3] - minX);
      local[i * 3 + 1] = (float) ((double) originY + xyz[i * 3 + 1]);
      local[i * 3 + 2] = (float) ((double) originZ + xyz[i * 3 + 2] - minZ);
    }
    quads.add(
        new StoredQuad(
            tile,
            key,
            materialName,
            imageKey,
            png.clone(),
            tint,
            alphaMode,
            Float.isFinite(emission) ? emission : 0,
            Float.isFinite(opacity) ? opacity : 1,
            local,
            uv.clone()));
  }

  public void addPointLight(float x, float y, float z, int color, int level) {
    if (level < 4 || !Float.isFinite(x) || !Float.isFinite(y) || !Float.isFinite(z)) return;
    TileKey tile;
    try {
      tile = tileOf(originX + (double) x, originZ + (double) z);
    } catch (IllegalArgumentException outOfRange) {
      return;
    }
    lights.add(
        new StoredLight(
            tile,
            (float) ((double) originX + x - grid.minBlock(tile.x())),
            (float) ((double) originY + y),
            (float) ((double) originZ + z - grid.minBlock(tile.z())),
            color,
            level));
  }

  public boolean hasGeometry() {
    return !quads.isEmpty();
  }

  public int tileCount() {
    return (int) quads.stream().map(quad -> quad.tile).distinct().count();
  }

  public TileManifest write(Path directory) throws IOException {
    if (!hasGeometry()) throw new IOException("The capture contains no renderable geometry.");
    Files.createDirectories(directory);
    Map<TileKey, List<StoredQuad>> quadsByTile = new TreeMap<>(TILE_ORDER);
    for (StoredQuad quad : quads)
      quadsByTile.computeIfAbsent(quad.tile, ignored -> new ArrayList<>()).add(quad);
    Map<TileKey, List<StoredLight>> lightsByTile = new TreeMap<>(TILE_ORDER);
    for (StoredLight light : lights)
      lightsByTile.computeIfAbsent(light.tile(), ignored -> new ArrayList<>()).add(light);
    List<TileManifest.Entry> entries = new ArrayList<>();
    long offset = 0;
    for (Map.Entry<TileKey, List<StoredQuad>> tile : quadsByTile.entrySet()) {
      TileKey key = tile.getKey();
      List<StoredQuad> tileQuads = tile.getValue();
      tileQuads.sort(QUAD_ORDER);
      List<StoredLight> tileLights = new ArrayList<>(lightsByTile.getOrDefault(key, List.of()));
      tileLights.sort(LIGHT_ORDER);
      GlbScene scene = new GlbScene();
      for (StoredQuad quad : tileQuads)
        scene.addQuad(
            quad.key,
            quad.materialName,
            quad.imageKey,
            quad.png,
            quad.tint,
            quad.alphaMode,
            quad.emission,
            quad.opacity,
            quad.xyz,
            quad.uv);
      for (StoredLight light : tileLights)
        scene.addPointLight(light.x(), light.y(), light.z(), light.color(), light.level());
      String file = TileManifest.fileName(key.x(), key.z());
      Path target = directory.resolve(file);
      scene.write(target);
      byte[] bytes = Files.readAllBytes(target);
      entries.add(
          new TileManifest.Entry(
              key.x(),
              key.z(),
              file,
              offset,
              bytes.length,
              TileManifest.sha256(bytes),
              tileQuads.size()));
      offset += bytes.length;
    }
    return new TileManifest(TileManifest.FORMAT, grid.tileChunks(), entries);
  }

  private TileKey tileOf(double worldX, double worldZ) {
    return new TileKey(grid.indexOf(worldX), grid.indexOf(worldZ));
  }

  private record TileKey(int x, int z) {}

  private record StoredLight(TileKey tile, float x, float y, float z, int color, int level) {}

  private static final class StoredQuad {
    final TileKey tile;
    final String key;
    final String materialName;
    final String imageKey;
    final byte[] png;
    final int tint;
    final int alphaMode;
    final float emission;
    final float opacity;
    final float[] xyz;
    final float[] uv;

    StoredQuad(
        TileKey tile,
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
      this.tile = tile;
      this.key = key;
      this.materialName = materialName;
      this.imageKey = imageKey;
      this.png = png;
      this.tint = tint;
      this.alphaMode = alphaMode;
      this.emission = emission;
      this.opacity = opacity;
      this.xyz = xyz;
      this.uv = uv;
    }
  }
}
