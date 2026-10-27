package dev.minemories.core;

import dev.minemories.core.TileMath.Tile;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Stream;

/** Disk-spooled capture split into tiles; each tile is a spooled GLB packed into one bundle. */
public final class TiledSpoolingScene implements CaptureScene {
  private static final int MAX_LIGHTS_PER_TILE = 128;
  private static final Comparator<Tile> TILE_ORDER =
      Comparator.comparingInt(Tile::x).thenComparingInt(Tile::z);

  private final Path temporaryParent;
  private final SpoolingGlbScene.Limits limits;
  private final TileGrid grid;
  private final Map<Tile, SpoolingGlbScene> scenes = new TreeMap<>(TILE_ORDER);
  private final Map<Tile, List<Light>> lights = new HashMap<>();
  private int originX;
  private int originY;
  private int originZ;
  private boolean originSet;
  private boolean originInUse;
  private boolean failed;
  private boolean closed;

  public TiledSpoolingScene(Path temporaryParent, SpoolingGlbScene.Limits limits, TileGrid grid) {
    this.temporaryParent = temporaryParent;
    this.limits = limits;
    this.grid = grid;
  }

  @Override
  public void setOrigin(int x, int y, int z) {
    if (originInUse && (x != originX || y != originY || z != originZ))
      throw new IllegalStateException("Capture origin already in use");
    originX = x;
    originY = y;
    originZ = z;
    originSet = true;
  }

  @Override
  public void setPlayerPosition(double x, double y, double z) {}

  @Override
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
      float[] uv)
      throws IOException {
    beginGeometry();
    try {
      if (xyz.length != 12 || uv.length != 8)
        throw new IllegalArgumentException("Expected 4 xyz and uv vertices");
      for (float value : xyz) if (!Float.isFinite(value)) return;
      for (float value : uv) if (!Float.isFinite(value)) return;
      Tile tile;
      try {
        tile = TileMath.quadTile(grid, originX, originZ, xyz);
      } catch (IllegalArgumentException outOfRange) {
        return;
      }
      float[] local = TileMath.localQuad(grid, originX, originY, originZ, tile, xyz);
      scene(tile)
          .addQuad(key, materialName, imageKey, png, tint, alphaMode, emission, opacity, local, uv);
    } catch (IOException error) {
      failed = true;
      throw error;
    }
  }

  @Override
  public void addPointLight(float x, float y, float z, int color, int level) throws IOException {
    beginGeometry();
    if (level < 4 || !Float.isFinite(x) || !Float.isFinite(y) || !Float.isFinite(z)) return;
    Tile tile;
    try {
      tile = TileMath.tileAt(grid, originX + (double) x, originZ + (double) z);
    } catch (IllegalArgumentException outOfRange) {
      return;
    }
    List<Light> tileLights = lights.computeIfAbsent(tile, ignored -> new ArrayList<>());
    if (tileLights.size() >= MAX_LIGHTS_PER_TILE) return;
    float[] local = TileMath.localPoint(grid, originX, originY, originZ, tile, x, y, z);
    tileLights.add(new Light(local[0], local[1], local[2], color, level));
  }

  @Override
  public boolean hasGeometry() {
    return !closed && !failed && quadCount() > 0;
  }

  @Override
  public int materialCount() {
    return scenes.values().stream().mapToInt(SpoolingGlbScene::materialCount).sum();
  }

  @Override
  public long quadCount() {
    return scenes.values().stream().mapToLong(SpoolingGlbScene::quadCount).sum();
  }

  @Override
  public void write(Path output) throws IOException {
    if (closed || failed) throw new IOException("Tiled capture is closed or invalid");
    if (!hasGeometry()) throw new IOException("The capture contains no renderable geometry.");
    Files.createDirectories(temporaryParent);
    Path workDirectory = Files.createTempDirectory(temporaryParent, ".minemories-tiles-");
    try {
      writeBundle(output, workDirectory);
    } catch (IOException error) {
      failed = true;
      throw error;
    } finally {
      deleteTree(workDirectory);
    }
  }

  @Override
  public void close() throws IOException {
    closed = true;
    IOException failure = null;
    for (SpoolingGlbScene scene : scenes.values()) {
      try {
        scene.close();
      } catch (IOException error) {
        if (failure == null) failure = error;
        else failure.addSuppressed(error);
      }
    }
    scenes.clear();
    lights.clear();
    if (failure != null) throw failure;
  }

  private void writeBundle(Path output, Path workDirectory) throws IOException {
    List<TileManifest.Entry> entries = new ArrayList<>();
    long offset = 0;
    for (Map.Entry<Tile, SpoolingGlbScene> entry : scenes.entrySet()) {
      SpoolingGlbScene scene = entry.getValue();
      Tile tile = entry.getKey();
      for (Light light : lights.getOrDefault(tile, List.of()))
        scene.addPointLight(light.x(), light.y(), light.z(), light.color(), light.level());
      lights.remove(tile);
      String file = TileManifest.fileName(tile.x(), tile.z());
      Path target = workDirectory.resolve(file);
      scene.write(target);
      byte[] bytes = Files.readAllBytes(target);
      entries.add(
          new TileManifest.Entry(
              tile.x(),
              tile.z(),
              file,
              offset,
              bytes.length,
              TileManifest.sha256(bytes),
              Math.toIntExact(scene.quadCount())));
      offset += bytes.length;
    }
    TileBundle.write(
        output, new TileManifest(TileManifest.FORMAT, grid.tileChunks(), entries), workDirectory);
  }

  private void beginGeometry() {
    if (closed) throw new IllegalStateException("Tiled capture is closed");
    if (!originSet) throw new IllegalStateException("Capture origin not set");
    originInUse = true;
  }

  private SpoolingGlbScene scene(Tile tile) throws IOException {
    SpoolingGlbScene scene = scenes.get(tile);
    if (scene == null) {
      scene = new SpoolingGlbScene(temporaryParent, limits);
      scenes.put(tile, scene);
    }
    return scene;
  }

  private static void deleteTree(Path directory) throws IOException {
    List<Path> paths;
    try (Stream<Path> stream = Files.walk(directory)) {
      paths = stream.sorted(Comparator.reverseOrder()).toList();
    }
    for (Path path : paths) Files.deleteIfExists(path);
  }

  private record Light(float x, float y, float z, int color, int level) {}
}
