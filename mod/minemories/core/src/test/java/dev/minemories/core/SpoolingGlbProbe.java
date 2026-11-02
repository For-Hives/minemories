package dev.minemories.core;

import java.lang.management.ManagementFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

/** Forked with a small heap by the regression suite; also usable as a local profiling fixture. */
public final class SpoolingGlbProbe {
  private SpoolingGlbProbe() {}

  private static void place(float[] positions, int index) {
    float x = index * 2f;
    float[] unit = {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0};
    for (int corner = 0; corner < 4; corner++) {
      positions[corner * 3] = x + unit[corner * 3];
      positions[corner * 3 + 1] = unit[corner * 3 + 1];
      positions[corner * 3 + 2] = unit[corner * 3 + 2];
    }
  }

  public static void main(String[] args) throws Exception {
    Path output = Path.of(args[0]).toAbsolutePath();
    int quads = Integer.parseInt(args[1]);
    byte[] png =
        Base64.getDecoder()
            .decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/HxoAAAAASUVORK5CYII=");
    // Each quad sits 2 blocks further: identical quads would be welded and shrink the output.
    float[] positions = new float[12];
    float[] uv = {0, 0, 1, 0, 1, 1, 0, 1};
    if (args.length > 2 && args[2].equals("legacy")) {
      GlbScene legacy = new GlbScene();
      for (int index = 0; index < quads; index++) {
        place(positions, index);
        legacy.addQuad("one", "one", "sprite", png, 0x70ff98, 0, 0, 1, positions, uv);
      }
      legacy.write(output);
      System.out.println("legacy bytes=" + Files.size(output));
      return;
    }
    long start = System.nanoTime(), observedHeap = 0;
    SpoolingGlbScene.Metrics metrics;
    try (SpoolingGlbScene scene = new SpoolingGlbScene(output.getParent())) {
      for (int index = 0; index < quads; index++) {
        place(positions, index);
        scene.addQuad("one", "one", "sprite", png, 0x70ff98, 0, 0, 1, positions, uv);
        if (index % 10000 == 0) {
          observedHeap =
              Math.max(
                  observedHeap, ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed());
        }
      }
      scene.write(output);
      metrics = scene.metrics();
      observedHeap =
          Math.max(
              observedHeap, ManagementFactory.getMemoryMXBean().getHeapMemoryUsage().getUsed());
    }
    System.out.println(
        "quads="
            + quads
            + " bytes="
            + Files.size(output)
            + " maxHeap="
            + Runtime.getRuntime().maxMemory()
            + " observedHeap="
            + observedHeap
            + " elapsedMs="
            + ((System.nanoTime() - start) / 1000000)
            + " metrics="
            + metrics);
  }
}
