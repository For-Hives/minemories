package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class FlywheelCaptureBridgeTest {
  /** Stands in for Flywheel 0.6's {@code Backend}: a static switch read with the level. */
  public static final class FakeBackend {
    static final AtomicBoolean INSTANCING = new AtomicBoolean();
    static final AtomicReference<Object> SEEN = new AtomicReference<>();

    private FakeBackend() {}

    public static boolean canUseInstancing(Object level) {
      SEEN.set(level);
      return INSTANCING.get();
    }

    public static boolean broken(Object level) {
      throw new IllegalStateException("backend not ready");
    }
  }

  private static FlywheelCaptureBridge.Probe probe(String method) {
    return FlywheelCaptureBridge.Probe.find(
        "Flywheel 0.6", FakeBackend.class.getName(), method, Object.class);
  }

  @Test
  void anAbsentFlywheelIsNotAnError() {
    var probe =
        FlywheelCaptureBridge.Probe.find(
            "Flywheel 0.6", "com.example.NoFlywheel", "canUseInstancing", Object.class);
    assertFalse(probe.present());
    probe.verify(null);
  }

  @Test
  void aBackendThatStepsAsidePassesWithTheCapturedLevel() {
    FakeBackend.INSTANCING.set(false);
    var level = new Object();
    probe("canUseInstancing").verify(level);
    assertSame(level, FakeBackend.SEEN.get());
  }

  @Test
  void aBackendStillDrawingOnTheGpuFailsTheCaptureInsteadOfDroppingParts() {
    FakeBackend.INSTANCING.set(true);
    var error =
        assertThrows(IllegalStateException.class, () -> probe("canUseInstancing").verify(null));
    assertEquals(
        "The Flywheel 0.6 renderer does not expose its CPU model during the capture.",
        error.getMessage());
  }

  @Test
  void anUnknownApiOrAFailingBackendFailsTheCapture() {
    var missing = probe("renamedSwitch");
    assertTrue(missing.present());
    assertEquals(
        "This Flywheel 0.6 version does not support CPU capture.",
        assertThrows(IllegalStateException.class, () -> missing.verify(null)).getMessage());
    var broken = assertThrows(IllegalStateException.class, () -> probe("broken").verify(null));
    assertEquals("The Flywheel 0.6 renderer cannot be captured.", broken.getMessage());
    assertEquals("backend not ready", broken.getCause().getCause().getMessage());
  }
}
