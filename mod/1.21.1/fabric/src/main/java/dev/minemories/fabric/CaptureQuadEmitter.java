package dev.minemories.fabric;

import java.util.function.Consumer;
import net.fabricmc.fabric.api.renderer.v1.mesh.QuadEmitter;

/** Fluent forwarding keeps models on the streaming emitter after every chained setter. */
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
  public QuadEmitter color(int i, int color) {
    delegate = delegate.color(i, color);
    return this;
  }

  @Override
  public QuadEmitter uv(int i, float u, float v) {
    delegate = delegate.uv(i, u, v);
    return this;
  }

  @Override
  public QuadEmitter spriteBake(
      net.minecraft.client.renderer.texture.TextureAtlasSprite sprite, int flags) {
    delegate = delegate.spriteBake(sprite, flags);
    return this;
  }

  @Override
  public QuadEmitter lightmap(int i, int light) {
    delegate = delegate.lightmap(i, light);
    return this;
  }

  @Override
  public QuadEmitter normal(int i, float x, float y, float z) {
    delegate = delegate.normal(i, x, y, z);
    return this;
  }

  @Override
  public QuadEmitter cullFace(net.minecraft.core.Direction face) {
    delegate = delegate.cullFace(face);
    return this;
  }

  @Override
  public QuadEmitter nominalFace(net.minecraft.core.Direction face) {
    delegate = delegate.nominalFace(face);
    return this;
  }

  @Override
  public QuadEmitter material(
      net.fabricmc.fabric.api.renderer.v1.material.RenderMaterial material) {
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
  public QuadEmitter copyFrom(net.fabricmc.fabric.api.renderer.v1.mesh.QuadView quad) {
    delegate = delegate.copyFrom(quad);
    return this;
  }

  @Override
  public QuadEmitter fromVanilla(int[] vertices, int offset) {
    delegate = delegate.fromVanilla(vertices, offset);
    return this;
  }

  @Override
  public QuadEmitter fromVanilla(
      net.minecraft.client.renderer.block.model.BakedQuad quad,
      net.fabricmc.fabric.api.renderer.v1.material.RenderMaterial material,
      net.minecraft.core.Direction face) {
    delegate = delegate.fromVanilla(quad, material, face);
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
  public org.joml.Vector3f copyPos(int i, org.joml.Vector3f target) {
    return delegate.copyPos(i, target);
  }

  @Override
  public int color(int i) {
    return delegate.color(i);
  }

  @Override
  public float u(int i) {
    return delegate.u(i);
  }

  @Override
  public float v(int i) {
    return delegate.v(i);
  }

  @Override
  public org.joml.Vector2f copyUv(int i, org.joml.Vector2f target) {
    return delegate.copyUv(i, target);
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
  public org.joml.Vector3f copyNormal(int i, org.joml.Vector3f target) {
    return delegate.copyNormal(i, target);
  }

  @Override
  public net.minecraft.core.Direction cullFace() {
    return delegate.cullFace();
  }

  @Override
  public net.minecraft.core.Direction lightFace() {
    return delegate.lightFace();
  }

  @Override
  public net.minecraft.core.Direction nominalFace() {
    return delegate.nominalFace();
  }

  @Override
  public org.joml.Vector3f faceNormal() {
    return delegate.faceNormal();
  }

  @Override
  public net.fabricmc.fabric.api.renderer.v1.material.RenderMaterial material() {
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
  public void toVanilla(int[] target, int offset) {
    delegate.toVanilla(target, offset);
  }
}
