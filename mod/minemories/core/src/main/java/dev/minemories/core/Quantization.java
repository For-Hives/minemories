package dev.minemories.core;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * {@code KHR_mesh_quantization} encoding shared by both writers. Positions become signed 16-bit
 * integers scaled by a power of two on the category node, so Minecraft's 1/16-block grid is exact
 * and rotated models are off by at most 1/256 block; UVs become normalized unsigned 16-bit and
 * normals normalized signed 8-bit. Every element is padded to a 4-byte boundary, as glTF requires.
 */
final class Quantization {
  static final int FLOAT_POSITION = 12, POSITION = 8, FLOAT_NORMAL = 12, NORMAL = 4;
  static final int FLOAT_UV = 8, UV = 4;
  private static final int LIMIT = 32766;
  private static final int MIN_SHIFT = 4, MAX_SHIFT = 7;

  private Quantization() {}

  /** Integer translation and power-of-two scale ({@code 1 / 2^shift}) of one category node. */
  record Plan(int shift, int x, int y, int z) {
    float scale() {
      return 1f / (1 << shift);
    }

    int quantize(float value, int origin) {
      return Math.round((value - origin) * (1 << shift));
    }
  }

  /** Null when the extent needs a coarser grid than 1/16 block: positions then stay float32. */
  static Plan plan(float[] min, float[] max) {
    int[] origin = new int[3];
    double half = 0;
    for (int axis = 0; axis < 3; axis++) {
      if (!Float.isFinite(min[axis]) || !Float.isFinite(max[axis])) return null;
      double center = Math.floor(((double) min[axis] + max[axis]) / 2);
      if (Math.abs(center) > 1e9) return null;
      origin[axis] = (int) center;
      half = Math.max(half, Math.max(Math.abs(min[axis] - center), Math.abs(max[axis] - center)));
    }
    for (int shift = MAX_SHIFT; shift >= MIN_SHIFT; shift--) {
      if (half * (1 << shift) <= LIMIT) return new Plan(shift, origin[0], origin[1], origin[2]);
    }
    return null;
  }

  static boolean uvFits(float u, float v) {
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  }

  /**
   * Converts whole float32 elements read from a spool; returns the bytes written to {@code out}.
   */
  static int convert(int kind, byte[] in, int length, byte[] out, Plan plan) {
    ByteBuffer source = ByteBuffer.wrap(in, 0, length).order(ByteOrder.LITTLE_ENDIAN);
    ByteBuffer target = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN);
    while (source.remaining() > 0) {
      switch (kind) {
        case 0 -> position(target, source.getFloat(), source.getFloat(), source.getFloat(), plan);
        case 1 -> normal(target, source.getFloat(), source.getFloat(), source.getFloat());
        default -> uv(target, source.getFloat(), source.getFloat());
      }
    }
    return target.position();
  }

  static void position(ByteBuffer out, float x, float y, float z, Plan plan) {
    out.putShort((short) plan.quantize(x, plan.x()))
        .putShort((short) plan.quantize(y, plan.y()))
        .putShort((short) plan.quantize(z, plan.z()))
        .putShort((short) 0);
  }

  static void normal(ByteBuffer out, float x, float y, float z) {
    out.put(unit(x)).put(unit(y)).put(unit(z)).put((byte) 0);
  }

  static void uv(ByteBuffer out, float u, float v) {
    out.putShort((short) Math.round(u * 65535f)).putShort((short) Math.round(v * 65535f));
  }

  private static byte unit(float value) {
    return (byte) Math.max(-127, Math.min(127, Math.round(value * 127f)));
  }

  /** Node translation and scale of a quantized category, or nothing for float32 positions. */
  static String transform(Plan plan) {
    if (plan == null) return "";
    return ",\"translation\":["
        + plan.x()
        + ","
        + plan.y()
        + ","
        + plan.z()
        + "],\"scale\":["
        + plan.scale()
        + ","
        + plan.scale()
        + ","
        + plan.scale()
        + "]";
  }

  /**
   * Root-level extension declarations. Normals are always quantized, so the extension is required.
   */
  static String extensions(boolean lights) {
    return ",\"extensionsUsed\":[\"KHR_mesh_quantization\""
        + (lights ? ",\"KHR_lights_punctual\"" : "")
        + "],\"extensionsRequired\":[\"KHR_mesh_quantization\"]";
  }
}
