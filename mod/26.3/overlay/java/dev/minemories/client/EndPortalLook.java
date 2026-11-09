package dev.minemories.client;

import com.mojang.blaze3d.platform.NativeImage;
import com.mojang.blaze3d.vertex.VertexConsumer;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import javax.imageio.ImageIO;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;

/**
 * The End portal and gateway are drawn by a fragment shader that layers the end sky and fifteen
 * rotated, tinted copies of the portal texture over the screen projection, so no texture of theirs
 * can be copied. This bakes one still frame of that shader (game time zero, flat coordinates) from
 * the game's own textures, and maps it on each face of the portal surface.
 */
final class EndPortalLook {
  static final Identifier KEY = Identifier.fromNamespaceAndPath("minemories", "procedural/end_portal");
  private static final Identifier SKY =
      Identifier.fromNamespaceAndPath("minecraft", "textures/environment/end_sky.png");
  private static final Identifier PORTAL =
      Identifier.fromNamespaceAndPath("minecraft", "textures/entity/end_portal/end_portal.png");
  private static final int SIZE = 128;
  private static final int LAYERS = 15;
  // Tints of the shader's COLORS table.
  private static final float[][] COLORS = {
    {0.022087f, 0.098399f, 0.110818f}, {0.011892f, 0.095924f, 0.089485f},
    {0.027636f, 0.101689f, 0.100326f}, {0.046564f, 0.109883f, 0.114838f},
    {0.064901f, 0.117696f, 0.097189f}, {0.063761f, 0.086895f, 0.123646f},
    {0.084817f, 0.111994f, 0.166380f}, {0.097489f, 0.154120f, 0.091064f},
    {0.106152f, 0.131144f, 0.195191f}, {0.097721f, 0.110188f, 0.187229f},
    {0.133516f, 0.138278f, 0.148582f}, {0.070006f, 0.243332f, 0.235792f},
    {0.196766f, 0.142899f, 0.214696f}, {0.047281f, 0.315338f, 0.321970f},
    {0.204675f, 0.390010f, 0.302066f}, {0.080955f, 0.314821f, 0.661491f}
  };

  private EndPortalLook() {}

  static boolean matches(String renderTypeName) {
    return renderTypeName.contains("end_portal") || renderTypeName.contains("end_gateway");
  }

  /** The baked frame as a PNG. */
  static byte[] png(Minecraft minecraft) throws IOException {
    int[] sky = read(minecraft, SKY), portal = read(minecraft, PORTAL);
    int skySize = (int) Math.sqrt(sky.length), portalSize = (int) Math.sqrt(portal.length);
    BufferedImage image = new BufferedImage(SIZE, SIZE, BufferedImage.TYPE_INT_RGB);
    for (int y = 0; y < SIZE; y++) {
      for (int x = 0; x < SIZE; x++) {
        float s = (x + 0.5f) / SIZE, t = (y + 0.5f) / SIZE;
        float[] color = new float[3];
        add(color, sample(sky, skySize, s, t), COLORS[0]);
        for (int layer = 1; layer <= LAYERS; layer++) {
          double angle = Math.toRadians((layer * layer * 4321.0 + layer * 9.0) * 2.0);
          double scale = (4.5 - layer / 4.0) * 2.0;
          double sx = 0.5 * s, sy = 0.5 * t;
          double w = 1 + 0.25 * (s + t) + sx * 17.0 / layer;
          double u = scale * (Math.cos(angle) * sx - Math.sin(angle) * sy) / w;
          double v = scale * (Math.sin(angle) * sx + Math.cos(angle) * sy) / w;
          add(color, sample(portal, portalSize, (float) u, (float) v), COLORS[layer - 1]);
        }
        int rgb = 0;
        for (float channel : color) rgb = (rgb << 8) | Math.min(255, Math.round(channel * 255f));
        image.setRGB(x, y, rgb);
      }
    }
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    ImageIO.write(image, "png", out);
    return out.toByteArray();
  }

  private static void add(float[] color, float sample, float[] tint) {
    for (int i = 0; i < 3; i++) color[i] += sample * tint[i];
  }

  /** Red channel (the portal textures are grey or near grey) with the sampler's repeat wrapping. */
  private static float sample(int[] pixels, int size, float u, float v) {
    int x = Math.floorMod((int) Math.floor(u * size), size);
    int y = Math.floorMod((int) Math.floor(v * size), size);
    return ((pixels[y * size + x] >> 16) & 255) / 255f;
  }

  private static int[] read(Minecraft minecraft, Identifier id) throws IOException {
    var resource = minecraft.getResourceManager().getResourceOrThrow(id);
    try (InputStream stream = resource.open();
        NativeImage image = NativeImage.read(stream)) {
      if (image.getWidth() != image.getHeight()) throw new IOException("Unexpected portal texture");
      return image.getPixels();
    }
  }

  /**
   * Gives each quad of the portal surface (positions only, no UV) planar texture coordinates: the
   * face's two varying axes are stretched over the whole texture.
   */
  static final class PlanarUv implements VertexConsumer {
    private final VertexConsumer target;
    private final float[] xyz = new float[12];
    private int count;

    PlanarUv(VertexConsumer target) {
      this.target = target;
    }

    @Override
    public VertexConsumer addVertex(float x, float y, float z) {
      xyz[count * 3] = x;
      xyz[count * 3 + 1] = y;
      xyz[count * 3 + 2] = z;
      if (++count == 4) {
        count = 0;
        flush();
      }
      return this;
    }

    private void flush() {
      float[] min = {Float.MAX_VALUE, Float.MAX_VALUE, Float.MAX_VALUE};
      float[] max = {-Float.MAX_VALUE, -Float.MAX_VALUE, -Float.MAX_VALUE};
      for (int vertex = 0; vertex < 4; vertex++) {
        for (int axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], xyz[vertex * 3 + axis]);
          max[axis] = Math.max(max[axis], xyz[vertex * 3 + axis]);
        }
      }
      int flat = 0;
      for (int axis = 1; axis < 3; axis++) if (max[axis] - min[axis] < max[flat] - min[flat]) flat = axis;
      int a = flat == 0 ? 1 : 0, b = flat == 2 ? 1 : 2;
      for (int vertex = 0; vertex < 4; vertex++) {
        float u = span(xyz[vertex * 3 + a], min[a], max[a]);
        float v = span(xyz[vertex * 3 + b], min[b], max[b]);
        target
            .addVertex(xyz[vertex * 3], xyz[vertex * 3 + 1], xyz[vertex * 3 + 2])
            .setColor(255, 255, 255, 255)
            .setUv(u, v);
      }
    }

    private static float span(float value, float min, float max) {
      return max > min ? (value - min) / (max - min) : 0f;
    }

    @Override
    public VertexConsumer setColor(int red, int green, int blue, int alpha) {
      return this;
    }

    @Override
    public VertexConsumer setColor(int argb) {
      return this;
    }

    @Override
    public VertexConsumer setUv(float u, float v) {
      return this;
    }

    @Override
    public VertexConsumer setUv1(int u, int v) {
      return this;
    }

    @Override
    public VertexConsumer setUv2(int u, int v) {
      return this;
    }

    @Override
    public VertexConsumer setUv3(float u, float v) {
      return this;
    }

    @Override
    public VertexConsumer setNormal(float x, float y, float z) {
      return this;
    }

    @Override
    public VertexConsumer setLineWidth(float width) {
      return this;
    }
  }
}
