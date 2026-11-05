package dev.minemories.fabric;

import com.mojang.math.Vector3f;
import java.util.function.Consumer;
import net.fabricmc.fabric.api.renderer.v1.material.RenderMaterial;
import net.fabricmc.fabric.api.renderer.v1.mesh.MutableQuadView;
import net.fabricmc.fabric.api.renderer.v1.mesh.QuadEmitter;
import net.minecraft.client.renderer.block.model.BakedQuad;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.core.Direction;

/**
 * Fluent forwarding keeps models on the streaming emitter after every chained setter. This is the
 * Fabric API 0.77 (multi-sprite renderer API) form of the 1.20+ wrapper.
 */
final class CaptureQuadEmitter implements QuadEmitter {
  private QuadEmitter delegate;
  private final Consumer<QuadEmitter> emit;

  CaptureQuadEmitter(QuadEmitter delegate, Consumer<QuadEmitter> emit) {
    this.delegate = delegate;
    this.emit = emit;
  }

  void replace(QuadEmitter next) {
    delegate = next;
  }

  /** The wrapped emitter, for Indigo calls that cast their argument to its own implementation. */
  QuadEmitter raw() {
    return delegate;
  }

  @Override
  public QuadEmitter emit() {
    emit.accept(delegate);
    return this;
  }

  @Override
  public QuadEmitter pos(int i, float x, float y, float z) {
    delegate = delegate.pos(i, x, y, z);
    return this;
  }

  @Override
  public QuadEmitter spriteColor(int i, int sprite, int color) {
    delegate = delegate.spriteColor(i, sprite, color);
    return this;
  }

  @Override
  public QuadEmitter sprite(int i, int sprite, float u, float v) {
    delegate = delegate.sprite(i, sprite, u, v);
    return this;
  }

  @Override
  public QuadEmitter spriteBake(int sprite, TextureAtlasSprite atlasSprite, int flags) {
    delegate = delegate.spriteBake(sprite, atlasSprite, flags);
    return this;
  }

  @Override
  public QuadEmitter lightmap(int i, int light) {
    delegate = delegate.lightmap(i, light);
    return this;
  }

  @Override
  public QuadEmitter normal(int i, float x, float y, float z) {
    delegate = (QuadEmitter) delegate.normal(i, x, y, z);
    return this;
  }

  @Override
  public QuadEmitter cullFace(Direction face) {
    delegate = delegate.cullFace(face);
    return this;
  }

  @Override
  public QuadEmitter nominalFace(Direction face) {
    delegate = delegate.nominalFace(face);
    return this;
  }

  @Override
  public QuadEmitter material(RenderMaterial material) {
    delegate = delegate.material(material);
    return this;
  }

  @Override
  public QuadEmitter colorIndex(int index) {
    delegate = delegate.colorIndex(index);
    return this;
  }

  @Override
  public QuadEmitter tag(int tag) {
    delegate = delegate.tag(tag);
    return this;
  }

  @Override
  public QuadEmitter fromVanilla(int[] vertices, int offset, boolean isItem) {
    delegate = delegate.fromVanilla(vertices, offset, isItem);
    return this;
  }

  @Override
  public QuadEmitter fromVanilla(BakedQuad quad, RenderMaterial material, Direction face) {
    delegate = (QuadEmitter) delegate.fromVanilla(quad, material, face);
    return this;
  }

  @Override
  public float x(int i) {
    return delegate.x(i);
  }

  @Override
  public float y(int i) {
    return delegate.y(i);
  }

  @Override
  public float z(int i) {
    return delegate.z(i);
  }

  @Override
  public float posByIndex(int i, int axis) {
    return delegate.posByIndex(i, axis);
  }

  @Override
  public Vector3f copyPos(int i, Vector3f target) {
    return delegate.copyPos(i, target);
  }

  @Override
  public float spriteU(int i, int sprite) {
    return delegate.spriteU(i, sprite);
  }

  @Override
  public float spriteV(int i, int sprite) {
    return delegate.spriteV(i, sprite);
  }

  @Override
  public int spriteColor(int i, int sprite) {
    return delegate.spriteColor(i, sprite);
  }

  @Override
  public int lightmap(int i) {
    return delegate.lightmap(i);
  }

  @Override
  public boolean hasNormal(int i) {
    return delegate.hasNormal(i);
  }

  @Override
  public float normalX(int i) {
    return delegate.normalX(i);
  }

  @Override
  public float normalY(int i) {
    return delegate.normalY(i);
  }

  @Override
  public float normalZ(int i) {
    return delegate.normalZ(i);
  }

  @Override
  public Vector3f copyNormal(int i, Vector3f target) {
    return delegate.copyNormal(i, target);
  }

  @Override
  public Direction cullFace() {
    return delegate.cullFace();
  }

  @Override
  public Direction lightFace() {
    return delegate.lightFace();
  }

  @Override
  public Direction nominalFace() {
    return delegate.nominalFace();
  }

  @Override
  public Vector3f faceNormal() {
    return delegate.faceNormal();
  }

  @Override
  public RenderMaterial material() {
    return delegate.material();
  }

  @Override
  public int colorIndex() {
    return delegate.colorIndex();
  }

  @Override
  public int tag() {
    return delegate.tag();
  }

  @Override
  public void copyTo(MutableQuadView target) {
    delegate.copyTo(target);
  }

  @Override
  public void toVanilla(int spriteIndex, int[] target, int targetIndex, boolean isItem) {
    delegate.toVanilla(spriteIndex, target, targetIndex, isItem);
  }
}
