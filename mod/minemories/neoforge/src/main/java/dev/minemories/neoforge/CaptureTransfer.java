package dev.minemories.neoforge;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Client-thread transfer retaining each packet until the worker accepts it. */
final class CaptureTransfer {
  interface Output {
    boolean begin(String key, int width, int height) throws IOException;

    boolean rows(String key, int row, int[] pixels) throws IOException;

    boolean end(String key) throws IOException;

    boolean geometry(List<CaptureElement.Quad> quads, List<CaptureElement.Light> lights)
        throws IOException;
  }

  interface Sources {
    CapturePixels.Source get(String key) throws IOException;
  }

  private final CaptureElement.Snapshot element;
  private final List<String> images = new ArrayList<>();
  private final Set<String> transferred;
  private int imageIndex, row, quadIndex, lightIndex;
  private CapturePixels.Source source;
  private boolean begun;
  private int[] pendingBand;

  CaptureTransfer(CaptureElement.Snapshot element, Set<String> transferred) {
    this.element = element;
    this.transferred = transferred;
    for (var quad : element.quads()) {
      String image = quad.material().image();
      if (!transferred.contains(image) && !images.contains(image)) images.add(image);
    }
  }

  boolean done() {
    return imageIndex == images.size()
        && quadIndex == element.quads().size()
        && lightIndex == element.lights().size();
  }

  boolean step(Sources sources, Output output) throws IOException {
    if (imageIndex < images.size()) return textureStep(sources, output);
    if (done()) return true;
    int quadEnd = Math.min(quadIndex + QueuedGlbCapture.MAX_BATCH_QUADS, element.quads().size());
    int lightEnd = Math.min(lightIndex + 128, element.lights().size());
    if (!output.geometry(
        element.quads().subList(quadIndex, quadEnd),
        element.lights().subList(lightIndex, lightEnd))) return false;
    quadIndex = quadEnd;
    lightIndex = lightEnd;
    return true;
  }

  private boolean textureStep(Sources sources, Output output) throws IOException {
    String key = images.get(imageIndex);
    if (source == null) source = sources.get(key);
    if (!begun) {
      if (!output.begin(key, source.width(), source.height())) return false;
      begun = true;
      return true;
    }
    if (row < source.height()) {
      int rows = Math.min(QueuedGlbCapture.MAX_BAND_PIXELS / source.width(), source.height() - row);
      if (pendingBand == null) pendingBand = source.readBand(row, rows);
      if (!output.rows(key, row, pendingBand)) return false;
      row += rows;
      pendingBand = null;
      return true;
    }
    if (!output.end(key)) return false;
    transferred.add(key);
    imageIndex++;
    source = null;
    begun = false;
    row = 0;
    return true;
  }
}
