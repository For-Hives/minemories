package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class DiagnosticReportTest {
  private static final UUID CORRELATION = UUID.fromString("961ca567-514c-4e57-b2cd-627465077bb2");
  private static final DiagnosticReport.Versions VERSIONS =
      new DiagnosticReport.Versions("0.1.0", "1.21.1", "neoforge-21.1.248");

  private static DiagnosticReport report(Throwable error, List<DiagnosticReport.Breadcrumb> steps) {
    return DiagnosticReport.create(
        DiagnosticReport.Phase.CAPTURE, VERSIONS, CORRELATION, error, steps);
  }

  private static JsonObject content(DiagnosticReport report) {
    return report.payload().getAsJsonObject("report");
  }

  private static JsonArray frames(DiagnosticReport report) {
    return content(report).getAsJsonObject("exception").getAsJsonArray("frames");
  }

  @Test
  void onlySendsSchemaFieldsWithGeneratedUuidUtcTimeAndTypedCorrelation() {
    Instant before = Instant.now();
    DiagnosticReport value = report(null, null);
    JsonObject payload = value.payload();
    JsonObject json = payload.getAsJsonObject("report");
    Instant time = Instant.parse(json.get("occurredAt").getAsString());
    assertFalse(time.isBefore(before));
    assertFalse(time.isAfter(Instant.now()));
    assertTrue(json.get("occurredAt").getAsString().endsWith("Z"));
    assertEquals(4, UUID.fromString(json.get("id").getAsString()).version());
    assertEquals(CORRELATION.toString(), json.get("correlationId").getAsString());
    assertTrue(payload.get("consent").getAsBoolean());
    assertEquals(2, payload.size());
    assertEquals(8, json.size());
    assertEquals("mod", json.get("source").getAsString());
    assertEquals("capture", json.get("phase").getAsString());
    assertEquals("0.1.0", json.getAsJsonObject("versions").get("mod").getAsString());
    assertEquals("1.21.1", json.getAsJsonObject("versions").get("minecraft").getAsString());
    assertEquals("neoforge-21.1.248", json.getAsJsonObject("versions").get("loader").getAsString());
    assertEquals(
        "java.lang.Throwable", json.getAsJsonObject("exception").get("type").getAsString());
    assertTrue(json.getAsJsonArray("breadcrumbs").isEmpty());
    assertThrows(
        NullPointerException.class,
        () ->
            DiagnosticReport.create(
                DiagnosticReport.Phase.CAPTURE, VERSIONS, null, null, List.of()));
    assertThrows(
        NullPointerException.class,
        () -> DiagnosticReport.create(null, VERSIONS, CORRELATION, null, List.of()));
    assertThrows(
        NullPointerException.class,
        () ->
            DiagnosticReport.create(
                DiagnosticReport.Phase.CAPTURE, null, CORRELATION, null, List.of()));
  }

  @Test
  void neverReadsThrowableMessagesSuppressedExceptionsOrRawPathsAndSurvivesHostileCauses() {
    Throwable error = new PrivateFailure();
    error.setStackTrace(
        new StackTraceElement[] {
          new StackTraceElement(
              "dev.minemories.client.Minemories",
              "exportBox",
              "/home/PrivatePlayer/secret.java",
              12)
        });
    error.addSuppressed(new IllegalArgumentException("seed 123456 coords 420 64 -42"));
    DiagnosticReport value = report(error, List.of());
    String json = value.payload().toString();
    assertFalse(json.contains("private-device-token"));
    assertFalse(json.contains("PrivatePlayer"));
    assertFalse(json.contains("https://private.example"));
    assertFalse(json.contains("seed"));
    assertFalse(json.contains("coords"));
    assertFalse(json.contains("suppressed"));
    assertFalse(json.contains("cause"));
    assertFalse(json.contains("message"));
    assertFalse(json.contains("/home"));
    assertEquals(1, frames(value).size());
    assertFalse(frames(value).get(0).getAsJsonObject().has("fileName"));
  }

  @Test
  void rejectsExternalNamespacesInvalidIdentifiersAndOverlongNames() {
    Throwable error = new IllegalStateException("private-device-token");
    error.setStackTrace(
        new StackTraceElement[] {
          new StackTraceElement("mod.player.PrivatePlayer", "handle", "PrivatePlayer.java", 1),
          new StackTraceElement("dev.minemoriesOther.Secret", "handle", "Secret.java", 2),
          new StackTraceElement("javaOther.Secret", "handle", "Secret.java", 3),
          new StackTraceElement("java.lang./private-token", "handle", "Secret.java", 4),
          new StackTraceElement("net.minecraft.foo..Invalid", "handle", "Secret.java", 5),
          new StackTraceElement("java.lang." + "x".repeat(151), "handle", "Secret.java", 6),
          new StackTraceElement(
              "dev.minemories.Minemories", "https://private.example", "X.java", 7),
          new StackTraceElement("dev.minemories.Minemories", "x".repeat(81), "X.java", 8),
          new StackTraceElement("dev.minemories.Minemories", "method\nsecret", "X.java", 9)
        });
    assertTrue(frames(report(error, null)).isEmpty());
    String json = report(error, null).payload().toString();
    assertFalse(json.contains("PrivatePlayer"));
    assertFalse(json.contains("private-device-token"));
    assertFalse(json.contains("private.example"));
  }

  @Test
  void preservesSafeFramesForAllSupportedNamespacesAndConstructorMethods() {
    Throwable error = new IllegalStateException("do not send");
    List<String> classes =
        List.of(
            "dev.minemories.client.Minemories$1",
            "net.minecraft.client.Minecraft",
            "net.neoforged.neoforge.client.ClientHooks",
            "com.mojang.blaze3d.systems.RenderSystem",
            "java.lang.Thread",
            "javax.crypto.Cipher",
            "com.google.gson.Gson");
    error.setStackTrace(
        classes.stream()
            .map(name -> new StackTraceElement(name, "lambda$write$1", "Worker.java", 42))
            .toArray(StackTraceElement[]::new));
    JsonArray result = frames(report(error, null));
    assertEquals(classes.size(), result.size());
    for (int index = 0; index < classes.size(); index++) {
      JsonObject frame = result.get(index).getAsJsonObject();
      assertEquals(classes.get(index), frame.get("className").getAsString());
      assertEquals("lambda$write$1", frame.get("methodName").getAsString());
      assertEquals("Worker.java", frame.get("fileName").getAsString());
      assertEquals(42, frame.get("lineNumber").getAsInt());
    }
    error.setStackTrace(
        new StackTraceElement[] {
          new StackTraceElement("java.lang.Thread", "<init>", "Thread.java", 0),
          new StackTraceElement("java.lang.Thread", "<clinit>", "Thread.java", 10_000_000)
        });
    result = frames(report(error, null));
    assertEquals(2, result.size());
    assertEquals("<init>", result.get(0).getAsJsonObject().get("methodName").getAsString());
    assertEquals(0, result.get(0).getAsJsonObject().get("lineNumber").getAsInt());
    assertEquals("<clinit>", result.get(1).getAsJsonObject().get("methodName").getAsString());
    assertEquals(10_000_000, result.get(1).getAsJsonObject().get("lineNumber").getAsInt());
  }

  @Test
  void omitsUnsafeFilenamesAndUnavailableLineNumbers() {
    List<String> filenames =
        Arrays.asList(
            null,
            "/home/user/Token.java",
            "C:\\Users\\user\\Token.java",
            "https://private.example/Token.java",
            "../Token.java",
            "Secret.kt",
            "X".repeat(76) + ".java",
            "Player\nSecret.java");
    Throwable error = new IllegalArgumentException();
    error.setStackTrace(
        filenames.stream()
            .map(name -> new StackTraceElement("java.lang.Thread", "run", name, -1))
            .toArray(StackTraceElement[]::new));
    for (var frame : frames(report(error, null))) {
      assertFalse(frame.getAsJsonObject().has("fileName"));
      assertFalse(frame.getAsJsonObject().has("lineNumber"));
    }
    error.setStackTrace(
        new StackTraceElement[] {
          new StackTraceElement("java.lang.Thread", "run", "Safe.java", -2),
          new StackTraceElement("java.lang.Thread", "run", "Safe.java", 10_000_001)
        });
    for (var frame : frames(report(error, null))) {
      assertTrue(frame.getAsJsonObject().has("fileName"));
      assertFalse(frame.getAsJsonObject().has("lineNumber"));
    }
  }

  @Test
  void boundsOutputAndWorkAndToleratesModDefinedBrokenStackTraces() {
    StackTraceElement safe = new StackTraceElement("java.lang.Thread", "run", "Thread.java", 1);
    StackTraceElement[] trace = new StackTraceElement[1_000];
    Arrays.fill(trace, safe);
    Throwable error = new IllegalStateException();
    error.setStackTrace(trace);
    assertEquals(12, frames(report(error, null)).size());
    Arrays.fill(trace, new StackTraceElement("foreign.mod.Mod", "tick", "Mod.java", 1));
    trace[128] = safe;
    error.setStackTrace(trace);
    assertTrue(frames(report(error, null)).isEmpty());
    assertTrue(frames(report(new NullStackFailure(), null)).isEmpty());
    assertTrue(frames(report(new BrokenStackFailure(), null)).isEmpty());
    assertEquals(1, frames(report(new NullElementFailure(safe), null)).size());
    assertEquals(
        "java.lang.Throwable",
        content(report(new org.opentest4j.AssertionFailedError("private-token"), null))
            .getAsJsonObject("exception")
            .get("type")
            .getAsString());
  }

  @Test
  void versionsHaveNoFreeTextAndValidValuesKeepTheirExactFormat() {
    List<String> invalid =
        Arrays.asList(
            null,
            "",
            "https://private.example",
            "secret version",
            "/home/PrivatePlayer",
            "-prefix",
            "_prefix",
            "é",
            "123\n456",
            "x".repeat(65));
    for (String version : invalid) {
      DiagnosticReport.Versions sanitized =
          new DiagnosticReport.Versions(version, version, version);
      assertEquals("unknown", sanitized.mod());
      assertEquals("unknown", sanitized.minecraft());
      assertEquals("unknown", sanitized.loader());
    }
    DiagnosticReport.Versions valid =
        new DiagnosticReport.Versions("v1.2_3+build-test", "1".repeat(64), "NeoForge_21.1.248");
    assertEquals("v1.2_3+build-test", valid.mod());
    assertEquals("1".repeat(64), valid.minecraft());
    assertEquals("NeoForge_21.1.248", valid.loader());
  }

  @Test
  void keepsLastEightTypedBreadcrumbsClampsElapsedAndDetachesCallerData() {
    List<DiagnosticReport.Breadcrumb> steps = new ArrayList<>();
    for (int index = 0; index < 10; index++) {
      steps.add(new DiagnosticReport.Breadcrumb(DiagnosticReport.Step.UPLOAD_CHUNK, index));
    }
    DiagnosticReport value = report(new IllegalStateException(), steps);
    steps.clear();
    JsonArray result = content(value).getAsJsonArray("breadcrumbs");
    assertEquals(8, result.size());
    assertEquals(2, result.get(0).getAsJsonObject().get("elapsedMs").getAsLong());
    assertEquals(9, result.get(7).getAsJsonObject().get("elapsedMs").getAsLong());
    JsonObject changed = value.payload();
    changed.getAsJsonObject("report").getAsJsonArray("breadcrumbs").remove(0);
    changed.getAsJsonObject("report").addProperty("source", "private-world");
    assertEquals(8, content(value).getAsJsonArray("breadcrumbs").size());
    assertEquals("mod", content(value).get("source").getAsString());
    List<DiagnosticReport.Breadcrumb> extremes =
        Arrays.asList(
            null,
            new DiagnosticReport.Breadcrumb(DiagnosticReport.Step.CAPTURE_STARTED, Long.MIN_VALUE),
            new DiagnosticReport.Breadcrumb(DiagnosticReport.Step.CAPTURE_FAILED, Long.MAX_VALUE));
    result = content(report(null, extremes)).getAsJsonArray("breadcrumbs");
    assertEquals(2, result.size());
    assertEquals(0, result.get(0).getAsJsonObject().get("elapsedMs").getAsLong());
    assertEquals(86_400_000, result.get(1).getAsJsonObject().get("elapsedMs").getAsLong());
    assertThrows(NullPointerException.class, () -> new DiagnosticReport.Breadcrumb(null, 0));
  }

  @Test
  void phasesAndEveryBreadcrumbUseOnlyTheAgreedProtocolValues() {
    List<String> expected =
        List.of(
            "capture_requested",
            "capture_started",
            "capture_written",
            "capture_completed",
            "capture_failed",
            "upload_requested",
            "upload_started",
            "upload_chunk",
            "upload_completed",
            "upload_failed",
            "pairing_started",
            "pairing_completed",
            "pairing_failed",
            "client_crashed");
    DiagnosticReport.Step[] steps = DiagnosticReport.Step.values();
    assertEquals(expected.size(), steps.length);
    for (int index = 0; index < steps.length; index++) {
      JsonObject json =
          content(report(null, List.of(new DiagnosticReport.Breadcrumb(steps[index], 1))))
              .getAsJsonArray("breadcrumbs")
              .get(0)
              .getAsJsonObject();
      assertEquals(expected.get(index), json.get("step").getAsString());
    }
    for (DiagnosticReport.Phase phase : DiagnosticReport.Phase.values()) {
      DiagnosticReport value =
          DiagnosticReport.create(phase, VERSIONS, CORRELATION, null, List.of());
      assertEquals(
          phase.name().toLowerCase(java.util.Locale.ROOT),
          content(value).get("phase").getAsString());
    }
  }

  private static final class PrivateFailure extends RuntimeException {
    private static final long serialVersionUID = 1L;

    PrivateFailure() {
      super("private-device-token https://private.example world PrivatePlayer seed 123 coords 456");
    }

    @Override
    public String getMessage() {
      throw new AssertionError("Messages must never be accessed");
    }

    @Override
    public synchronized Throwable getCause() {
      throw new AssertionError("Causes must never be accessed");
    }
  }

  private static final class NullStackFailure extends RuntimeException {
    private static final long serialVersionUID = 1L;

    @Override
    public StackTraceElement[] getStackTrace() {
      return null;
    }
  }

  private static final class BrokenStackFailure extends RuntimeException {
    private static final long serialVersionUID = 1L;

    @Override
    public StackTraceElement[] getStackTrace() {
      throw new IllegalStateException("private-token");
    }
  }

  private static final class NullElementFailure extends RuntimeException {
    private static final long serialVersionUID = 1L;
    private final StackTraceElement frame;

    NullElementFailure(StackTraceElement frame) {
      this.frame = frame;
    }

    @Override
    public StackTraceElement[] getStackTrace() {
      return new StackTraceElement[] {null, frame};
    }
  }
}
