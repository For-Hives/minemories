package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import com.mojang.blaze3d.vertex.PoseStack;
import java.util.ArrayList;
import java.util.List;
import org.joml.Vector3f;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class LegacyContraptionsTest {
  /** Stands in for Create 0.5.1's {@code AbstractContraptionEntity}. */
  public static class FakeEntity {
    Object contraption = "contraption";
    boolean alive = true;
    final List<Float> partialTicks = new ArrayList<>();

    public Object getContraption() {
      return contraption;
    }

    public boolean isAliveOrStale() {
      return alive;
    }

    public boolean isReadyForRender() {
      return true;
    }

    /** A contraption standing 2 blocks up and turned by its bearing. */
    public void applyLocalTransforms(Object pose, float partialTick) {
      partialTicks.add(partialTick);
      ((PoseStack) pose).translate(0, 2, 0);
    }
  }

  /** {@code ContraptionMatrices}: four matrices and a private "set up this frame" flag. */
  public static class FakeMatrices {
    private boolean ready;
    // Create hands out its own matrices for the renderers to change; so does this fake.
    private final List<PoseStack> stacks =
        new ArrayList<>(List.of(new PoseStack(), new PoseStack(), new PoseStack()));

    public void clear() {
      ready = false;
      stacks.replaceAll(stack -> new PoseStack());
    }

    public PoseStack getViewProjection() {
      return stacks.get(0);
    }

    public PoseStack getModelViewProjection() {
      return stacks.get(1);
    }

    public PoseStack getModel() {
      return stacks.get(2);
    }
  }

  /** {@code ContraptionRenderInfo}. */
  public static class FakeInfo {
    public final Object renderWorld = "render world";
    private final List<FakeMatrices> matrices = List.of(new FakeMatrices());

    public FakeMatrices getMatrices() {
      return matrices.get(0);
    }
  }

  /** {@code ContraptionRenderingWorld}: one render info per contraption. */
  public static class FakeRenderingWorld {
    final FakeInfo info = new FakeInfo();

    public FakeInfo getRenderInfo(Object contraption) {
      assertEquals("contraption", contraption);
      return info;
    }
  }

  /** Flywheel's {@code WorldAttached}. */
  public static class FakeWorlds {
    private final List<FakeRenderingWorld> world =
        new ArrayList<>(List.of(new FakeRenderingWorld()));

    public FakeRenderingWorld get(Object level) {
      assertEquals("level", level);
      return world.get(0);
    }

    void reset() {
      world.set(0, new FakeRenderingWorld());
    }
  }

  /** {@code SuperByteBuffer}: one per chunk layer. */
  public static class FakeBuffer {
    final String layer;
    Object transform;
    Object pose;
    Object consumer;
    boolean deleted;

    FakeBuffer(String layer) {
      this.layer = layer;
    }

    public boolean isEmpty() {
      return layer.equals("translucent");
    }

    public FakeBuffer transform(Object stack) {
      if (layer.equals("broken")) throw new IllegalStateException("broken layer");
      transform = stack;
      return this;
    }

    public void renderInto(Object input, Object builder) {
      pose = input;
      consumer = builder;
    }

    public void delete() {
      deleted = true;
    }
  }

  /** {@code ContraptionRenderDispatcher}. */
  public static class FakeDispatcher {
    private static final FakeWorlds WORLDS = new FakeWorlds();
    static final java.util.concurrent.atomic.AtomicBoolean INSTANCING =
        new java.util.concurrent.atomic.AtomicBoolean();
    static final List<FakeBuffer> BUILT = new ArrayList<>();

    public static boolean canInstance() {
      return INSTANCING.get();
    }

    public static FakeBuffer buildStructureBuffer(
        Object renderWorld, Object contraption, Object layer) {
      assertEquals("render world", renderWorld);
      var buffer = new FakeBuffer((String) layer);
      BUILT.add(buffer);
      return buffer;
    }
  }

  public static class Ambiguous {
    public void clear() {}

    public void get(Object a) {}

    public void get(String a) {}
  }

  private static LegacyContraptions.Names names(String entity) {
    String prefix = LegacyContraptionsTest.class.getName() + "$";
    return new LegacyContraptions.Names(
        entity,
        prefix + "FakeDispatcher",
        prefix + "FakeRenderingWorld",
        prefix + "FakeInfo",
        prefix + "FakeMatrices",
        prefix + "FakeBuffer",
        Object.class.getName());
  }

  private static LegacyContraptions.Api api() throws ReflectiveOperationException {
    return LegacyContraptions.Api.find(names(FakeEntity.class.getName()));
  }

  private static FakeMatrices matrices() {
    return FakeDispatcher.WORLDS.get("level").info.getMatrices();
  }

  private static Vector3f origin(PoseStack pose) {
    return pose.last().pose().transformPosition(new Vector3f());
  }

  @BeforeEach
  void freshCreate() {
    FakeDispatcher.WORLDS.reset();
    FakeDispatcher.INSTANCING.set(false);
    FakeDispatcher.BUILT.clear();
    LegacyContraptions.reset();
  }

  @Test
  void withoutCreate051NothingIsBoundAndNoEntityIsTouched() throws Exception {
    assertNull(LegacyContraptions.Api.find(LegacyContraptions.Names.CREATE_0_5_1));
    assertNull(LegacyContraptions.Api.find(names("com.example.NoCreate")));
    assertSame(
        LegacyContraptions.NONE, LegacyContraptions.prepare(new FakeEntity(), "level", 0, 0, 0));
  }

  @Test
  void aCreateWhoseApiChangedIsRefusedWhenBound() {
    var wrong = names(FakeEntity.class.getName());
    var renamed =
        new LegacyContraptions.Names(
            wrong.entity(),
            wrong.dispatcher(),
            wrong.renderingWorld(),
            wrong.renderInfo(),
            wrong.matrices(),
            LegacyContraptionsTest.class.getName() + "$Ambiguous",
            wrong.flywheelWorld());
    assertThrows(ReflectiveOperationException.class, () -> LegacyContraptions.Api.find(renamed));
    var error =
        assertThrows(
            NoSuchMethodException.class,
            () -> LegacyContraptions.Api.method(Ambiguous.class, "get", 1));
    assertTrue(error.getMessage().endsWith("Ambiguous.get is ambiguous"));
  }

  @Test
  void theEntityRendererSeesCreatesMatricesAtTheCapturePose() throws Exception {
    var entity = new FakeEntity();
    var drawing = LegacyContraptions.prepare(api(), entity, "level", 3, 4, -5);

    var matrices = matrices();
    assertTrue(matrices.ready, "renderFromEntity only draws block entities when ready");
    assertEquals(new Vector3f(3, 4, -5), origin(matrices.getViewProjection()));
    assertEquals(new Vector3f(3, 6, -5), origin(matrices.getModelViewProjection()));
    assertEquals(new Vector3f(0, 2, 0), origin(matrices.getModel()));
    assertEquals(List.of(1f, 1f), entity.partialTicks, "the latest tick, like every entity");

    drawing.finish(List.of(), layer -> fail("no layer"));
    assertFalse(matrices.ready, "the next frame sets the matrices up from the camera again");
  }

  @Test
  void everyNonEmptyChunkLayerIsDrawnWithTheContraptionMatrices() throws Exception {
    var drawing = LegacyContraptions.prepare(api(), new FakeEntity(), "level", 1, 0, 0);
    var model = matrices().getModel();
    var view = matrices().getViewProjection();

    drawing.finish(List.of("solid", "translucent", "cutout"), layer -> "buffer of " + layer);

    assertEquals(3, FakeDispatcher.BUILT.size());
    var solid = FakeDispatcher.BUILT.get(0);
    assertSame(model, solid.transform);
    assertSame(view, solid.pose);
    assertEquals("buffer of solid", solid.consumer);
    assertNull(FakeDispatcher.BUILT.get(1).consumer, "an empty layer asks for no buffer");
    assertEquals("buffer of cutout", FakeDispatcher.BUILT.get(2).consumer);
    assertTrue(FakeDispatcher.BUILT.stream().allMatch(buffer -> buffer.deleted));
    assertFalse(matrices().ready);
  }

  @Test
  void aContraptionNotDrawnInGameIsNotDrawnInTheCapture() throws Exception {
    var entity = new FakeEntity();
    entity.alive = false;
    LegacyContraptions.prepare(api(), entity, "level", 0, 0, 0).finish(List.of("solid"), l -> l);
    assertTrue(FakeDispatcher.BUILT.isEmpty());

    entity.contraption = null;
    assertSame(
        LegacyContraptions.NONE, LegacyContraptions.prepare(api(), entity, "level", 0, 0, 0));
  }

  @Test
  void aFailingLayerKeepsTheCaptureAndStillHandsTheMatricesBack() throws Exception {
    FakeDispatcher.INSTANCING.set(true); // a missing mixin is logged, the blocks are still drawn
    var drawing = LegacyContraptions.prepare(api(), new FakeEntity(), "level", 0, 0, 0);
    drawing.finish(List.of("broken", "solid"), layer -> layer);

    assertEquals(1, FakeDispatcher.BUILT.size(), "drawing stops at the failing layer");
    assertTrue(FakeDispatcher.BUILT.get(0).deleted);
    assertFalse(matrices().ready);
    LegacyContraptions.NONE.finish(List.of("solid"), layer -> fail("nothing to draw"));
  }
}
