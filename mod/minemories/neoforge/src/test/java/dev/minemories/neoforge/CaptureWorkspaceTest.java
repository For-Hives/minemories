package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.*;

import dev.minemories.core.SpoolingGlbScene;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class CaptureWorkspaceTest {
  @TempDir Path parent;

  @Test
  void aRealAbruptProcessExitLeavesSpoolFilesThatAreReclaimedWithoutTouchingHistory()
      throws Exception {
    Path complete = parent.resolve("capture.glb");
    Files.writeString(complete, "complete");
    String classpath =
        String.join(
            java.io.File.pathSeparator,
            location(CaptureWorkspaceCrashProbe.class),
            location(CaptureWorkspace.class),
            location(SpoolingGlbScene.class));
    Process process =
        new ProcessBuilder(
                Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                "-cp",
                classpath,
                CaptureWorkspaceCrashProbe.class.getName(),
                parent.toString())
            .redirectError(ProcessBuilder.Redirect.INHERIT)
            .start();
    try {
      assertTrue(process.waitFor(30, TimeUnit.SECONDS), "The controlled child must terminate");
      String output =
          new String(
                  process.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8)
              .trim();
      assertEquals(17, process.exitValue(), output);
      Path abandoned = Path.of(output);
      try (var paths = Files.walk(abandoned)) {
        long bytes = 0;
        for (Path path : paths.toList()) if (Files.isRegularFile(path)) bytes += Files.size(path);
        assertTrue(bytes > 8192, "The crash leaves real partially written binary data");
      }
      assertEquals(1, CaptureWorkspace.cleanupAbandoned(parent, 64));
      assertFalse(Files.exists(abandoned));
      assertEquals("complete", Files.readString(complete));
    } finally {
      if (process.isAlive()) process.destroyForcibly();
    }
  }

  private static String location(Class<?> type) throws Exception {
    return Path.of(type.getProtectionDomain().getCodeSource().getLocation().toURI()).toString();
  }

  @Test
  void activeWorkspaceIsNotDeletedAndNormalCloseKeepsCompleteExports() throws Exception {
    Path complete = parent.resolve("capture.glb");
    Files.writeString(complete, "previous complete export");
    Path workspace;
    try (var work = new CaptureWorkspace(parent)) {
      workspace = work.directory();
      Files.write(workspace.resolve("texture-0.png"), new byte[] {1, 2, 3});
      assertEquals(0, CaptureWorkspace.cleanupAbandoned(parent, 64));
      assertTrue(Files.exists(workspace.resolve("texture-0.png")));
      // The writer's own cleanup handles the nested spool, before workspace closure.
      try (var scene = new SpoolingGlbScene(workspace)) {
        assertFalse(scene.hasGeometry());
      }
    }
    assertFalse(Files.exists(workspace));
    assertEquals("previous complete export", Files.readString(complete));
  }

  @Test
  void unknownFilesAndLinksMakeCleanupPreserveTheWholeWorkspace() throws Exception {
    var work = new CaptureWorkspace(parent);
    Path directory = work.directory();
    Path complete = directory.resolve("capture.glb");
    Files.writeString(complete, "do not delete");
    Files.write(directory.resolve("texture-0.png"), new byte[] {1});
    assertThrows(IOException.class, work::close);
    assertEquals(0, CaptureWorkspace.cleanupAbandoned(parent, 64));
    assertTrue(Files.exists(directory.resolve("texture-0.png")));
    assertEquals("do not delete", Files.readString(complete));
    Files.delete(complete);
    Path outside = parent.resolve("outside.png");
    Files.writeString(outside, "original");
    Files.createSymbolicLink(directory.resolve("texture-1.png"), outside);
    assertEquals(0, CaptureWorkspace.cleanupAbandoned(parent, 64));
    assertEquals("original", Files.readString(outside));
    Files.delete(directory.resolve("texture-1.png"));
    assertEquals(1, CaptureWorkspace.cleanupAbandoned(parent, 64));
    assertFalse(Files.exists(directory));
    work.close();
  }

  @Test
  void replacedOrMissingOwnerAndDirectoryDoNotGrantDeletionAuthority() throws Exception {
    var work = new CaptureWorkspace(parent);
    Path directory = work.directory();
    Files.writeString(directory.resolve(".owner"), "different marker");
    assertThrows(IOException.class, work::close);
    assertEquals(0, CaptureWorkspace.cleanupAbandoned(parent, 64));
    assertTrue(Files.exists(directory));
    Files.writeString(directory.resolve(".owner"), "MINEMORIES_CAPTURE_WORK_V1\n");
    assertEquals(1, CaptureWorkspace.cleanupAbandoned(parent, 64));
    work.close();
    assertEquals(0, CaptureWorkspace.cleanupAbandoned(parent.resolve("missing"), 64));
    assertThrows(
        IllegalArgumentException.class, () -> CaptureWorkspace.cleanupAbandoned(parent, 0));
    assertThrows(
        IllegalArgumentException.class, () -> CaptureWorkspace.cleanupAbandoned(parent, 65));
  }
}
