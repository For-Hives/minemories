package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class CaptureVolumeTest {
  private static CaptureVolume volume(int size, CaptureVolume.Owner owner) {
    return new CaptureVolume(
        "test",
        new CaptureBounds(0, 0, 0, size - 1, size - 1, size - 1),
        Placement.translation(0, 0, 0),
        owner);
  }

  @Test
  void containsOnlyWhatItsOwnPlotHolds() {
    var volume = volume(32, (chunkX, chunkZ) -> chunkX == 1 && chunkZ == 0);
    assertTrue(volume.contains(20.5, 3, 4));
    assertFalse(volume.contains(4, 3, 4), "chunk of another plot");
    assertFalse(volume.contains(20.5, 40, 4), "outside the cells");
    assertFalse(volume.contains(Double.NaN, 3, 4));
    assertEquals(32L * 32 * 32, volume.cellCount());
  }

  @Test
  void keepsVolumesWithinTheCaptureLimits() {
    List<CaptureVolume> found = new ArrayList<>();
    for (int i = 0; i < CaptureVolume.MAX_VOLUMES + 3; i++) found.add(volume(2, (x, z) -> true));
    assertEquals(CaptureVolume.MAX_VOLUMES, CaptureVolume.within(found).size());

    var huge = volume(201, (x, z) -> true);
    var small = volume(4, (x, z) -> true);
    assertTrue(huge.cellCount() > CaptureVolume.MAX_CELLS);
    assertEquals(List.of(small), CaptureVolume.within(List.of(huge, small)));
  }

  @Test
  void aWholeVolumeIsNeverSealed() {
    var sky = CutBoundary.OpenAir.sky(new CaptureBounds(-2, 5, -2, 2, 9, 2));
    sky.settle();
    for (int y = 5; y <= 9; y++) assertFalse(sky.enclosed(-2, y, 0));
  }
}
