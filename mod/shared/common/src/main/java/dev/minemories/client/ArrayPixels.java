package dev.minemories.client;

/** A pixel source backed by an array: textures the game does not hold, built by the capture. */
final class ArrayPixels implements CapturePixels.Source {
  private final String key;
  private final int[] abgr;
  private final int width;
  private final int height;

  ArrayPixels(String key, int[] abgr, int width, int height) {
    if (abgr.length != width * height) throw new IllegalArgumentException("Pixel count mismatch");
    this.key = key;
    this.abgr = abgr.clone();
    this.width = width;
    this.height = height;
  }

  @Override
  public String key() {
    return key;
  }

  @Override
  public int width() {
    return width;
  }

  @Override
  public int height() {
    return height;
  }

  @Override
  public int[] readBand(int row, int rows) {
    if (row < 0 || rows < 1 || row + rows > height)
      throw new IllegalArgumentException("Band out of range");
    int[] band = new int[width * rows];
    System.arraycopy(abgr, row * width, band, 0, band.length);
    return band;
  }
}
