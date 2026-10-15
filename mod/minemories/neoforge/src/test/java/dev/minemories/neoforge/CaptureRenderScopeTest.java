package dev.minemories.neoforge;

import static org.junit.jupiter.api.Assertions.*;

import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;

class CaptureRenderScopeTest {
  @Test
  void nestedRenderersKeepTheOuterScopeAndRestoreItOnFailure() {
    assertFalse(CaptureRenderScope.active());
    CaptureRenderScope.render(
        () -> {
          assertTrue(CaptureRenderScope.active());
          assertThrows(
              IllegalStateException.class,
              () ->
                  CaptureRenderScope.render(
                      () -> {
                        throw new IllegalStateException("renderer failed");
                      }));
          assertTrue(CaptureRenderScope.active());
        });
    assertFalse(CaptureRenderScope.active());
    assertThrows(
        IllegalArgumentException.class,
        () ->
            CaptureRenderScope.render(
                () -> {
                  throw new IllegalArgumentException("unsupported pass");
                }));
    assertFalse(CaptureRenderScope.active());
  }

  @Test
  void normalRenderingOnAnotherThreadDoesNotInheritTheCaptureScope() {
    CaptureRenderScope.render(
        () -> {
          assertFalse(CompletableFuture.supplyAsync(CaptureRenderScope::active).join());
          assertTrue(CaptureRenderScope.active());
        });
    assertFalse(CaptureRenderScope.active());
  }
}
