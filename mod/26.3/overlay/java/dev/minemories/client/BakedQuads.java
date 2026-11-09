package dev.minemories.client;

import net.minecraft.client.model.geom.builders.UVPair;
import net.minecraft.client.resources.model.geometry.BakedQuad;
import org.joml.Vector3fc;

/**
 * Minecraft 26.3 bakes quads into records whose material (sprite, tint, emission) lives in
 * {@code materialInfo()}; the shared capture reads the 1.21.1 vertex layout (8 ints per vertex:
 * position, colour, UV, light, normal), so this packs a record back into it.
 */
final class BakedQuads {
  private BakedQuads() {}

  static int[] vertices(BakedQuad quad) {
    int[] packed = new int[BakedQuad.VERTEX_COUNT * 8];
    for (int vertex = 0; vertex < BakedQuad.VERTEX_COUNT; vertex++) {
      int base = vertex * 8;
      Vector3fc position = quad.position(vertex);
      long uv = quad.packedUV(vertex);
      packed[base] = Float.floatToRawIntBits(position.x());
      packed[base + 1] = Float.floatToRawIntBits(position.y());
      packed[base + 2] = Float.floatToRawIntBits(position.z());
      packed[base + 4] = Float.floatToRawIntBits(UVPair.unpackU(uv));
      packed[base + 5] = Float.floatToRawIntBits(UVPair.unpackV(uv));
      packed[base + 6] = quad.materialInfo().lightEmission() << 4;
    }
    return packed;
  }
}
