package dev.minemories.client;

import dev.minemories.core.SpoolingGlbScene;
import java.nio.file.Files;
import java.nio.file.Path;

/** Test-only process: deliberately leave buffered spool files and let the OS release its lock. */
public final class CaptureWorkspaceCrashProbe {
  private CaptureWorkspaceCrashProbe() {}

  public static void main(String[] arguments) throws Exception {
    var workspace = new CaptureWorkspace(Path.of(arguments[0]));
    Files.write(workspace.directory().resolve("texture-0.png"), new byte[] {1, 2, 3});
    var scene = new SpoolingGlbScene(workspace.directory());
    for (int index = 0; index < 2000; index++)
      scene.addQuad(
          "key",
          "name",
          "image",
          new byte[] {1},
          0xffffff,
          0,
          0,
          1,
          new float[] {0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0},
          new float[] {0, 0, 1, 0, 1, 1, 0, 1});
    System.out.println(workspace.directory());
    System.out.flush();
    Runtime.getRuntime().halt(17);
  }
}
