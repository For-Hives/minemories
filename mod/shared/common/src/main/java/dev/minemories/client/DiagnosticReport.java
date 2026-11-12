package dev.minemories.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

/** Sanitized failure data. The sender must separately enforce current pairing and consent. */
final class DiagnosticReport {
  static final int MAX_FRAMES = 24;
  static final int MAX_BREADCRUMBS = 16;
  static final long MAX_ELAPSED_MILLIS = 86_400_000;
  private static final int MAX_INSPECTED_FRAMES = 128;
  private static final int MAX_LINE_NUMBER = 10_000_000;
  private static final Pattern CLASS_NAME =
      Pattern.compile("[A-Za-z_$][A-Za-z0-9_$]*(\\.[A-Za-z_$][A-Za-z0-9_$]*)*");
  private static final Pattern METHOD_NAME = Pattern.compile("[A-Za-z_$][A-Za-z0-9_$]*");
  private static final Pattern FILE_NAME = Pattern.compile("[A-Za-z_$][A-Za-z0-9_$]*\\.java");
  private static final Pattern VERSION = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._+-]*");
  private static final List<String> SAFE_NAMESPACES =
      List.of(
          "dev.minemories.",
          "net.minecraft.",
          "net.neoforged.",
          "net.minecraftforge.",
          "net.fabricmc.",
          "org.quiltmc.",
          "com.mojang.",
          "java.",
          "javax.",
          "com.google.gson.");

  enum Phase {
    CAPTURE("capture"),
    UPLOAD("upload"),
    PAIRING("pairing"),
    CRASH("crash"),
    /** A handled error (a command or screen failed, the game carried on). */
    ERROR("error");

    private final String value;

    Phase(String value) {
      this.value = value;
    }
  }

  enum Step {
    CAPTURE_REQUESTED("capture_requested"),
    CAPTURE_STARTED("capture_started"),
    CAPTURE_WRITTEN("capture_written"),
    CAPTURE_COMPLETED("capture_completed"),
    CAPTURE_FAILED("capture_failed"),
    UPLOAD_REQUESTED("upload_requested"),
    UPLOAD_STARTED("upload_started"),
    UPLOAD_SESSION("upload_session"),
    UPLOAD_CHUNK("upload_chunk"),
    UPLOAD_COMPLETING("upload_completing"),
    UPLOAD_COMPLETED("upload_completed"),
    UPLOAD_FAILED("upload_failed"),
    PAIRING_STARTED("pairing_started"),
    PAIRING_COMPLETED("pairing_completed"),
    PAIRING_FAILED("pairing_failed"),
    CLIENT_CRASHED("client_crashed"),
    ERROR_HANDLED("error_handled");

    private final String value;

    Step(String value) {
      this.value = value;
    }
  }

  record Versions(String mod, String minecraft, String loader) {
    Versions {
      mod = safeVersion(mod);
      minecraft = safeVersion(minecraft);
      loader = safeVersion(loader);
    }
  }

  record Breadcrumb(Step step, long elapsedMs) {
    Breadcrumb {
      Objects.requireNonNull(step, "step");
      elapsedMs = Math.max(0, Math.min(MAX_ELAPSED_MILLIS, elapsedMs));
    }
  }

  /** A failure that names its own reason with a fixed code (never a message). */
  interface Detailed {
    String diagnosticDetail();
  }

  private static final Pattern CODE = Pattern.compile("[a-z][a-z0-9_]{0,63}");
  private static final Pattern ARCH = Pattern.compile("[a-z0-9_-]{1,16}");

  /** The last HTTP exchange of an upload: its kind, the attempts made and what the API answered. */
  record Http(String request, int attempts, int status, String error, long retryAfterSeconds) {
    Http {
      if (!List.of("initialize", "chunk", "complete").contains(request))
        throw new IllegalArgumentException("request");
      attempts = Math.max(1, Math.min(3, attempts));
      status = status >= 100 && status <= 599 ? status : 0;
      error = error != null && CODE.matcher(error).matches() ? error : null;
      retryAfterSeconds = retryAfterSeconds < 0 ? -1 : Math.min(86_400, retryAfterSeconds);
    }
  }

  record Upload(long sizeBytes, long offsetBytes, int chunks) {
    Upload {
      sizeBytes = Math.max(0, Math.min(10_000_000_000L, sizeBytes));
      offsetBytes = Math.max(0, Math.min(10_000_000_000L, offsetBytes));
      chunks = Math.max(0, Math.min(100_000, chunks));
    }
  }

  record Environment(String os, String arch, String javaVersion, long maxMemoryMb, int processors) {
    static Environment current() {
      String name =
          String.valueOf(System.getProperty("os.name")).toLowerCase(java.util.Locale.ROOT);
      String os =
          name.startsWith("windows")
              ? "windows"
              : name.startsWith("mac") ? "macos" : name.startsWith("linux") ? "linux" : "other";
      String arch =
          String.valueOf(System.getProperty("os.arch")).toLowerCase(java.util.Locale.ROOT);
      Runtime runtime = Runtime.getRuntime();
      return new Environment(
          os,
          ARCH.matcher(arch).matches() ? arch : "other",
          safeVersion(System.getProperty("java.version")),
          Math.min(1_048_576, runtime.maxMemory() / (1024 * 1024)),
          Math.max(1, Math.min(1024, runtime.availableProcessors())));
    }
  }

  /**
   * Typed context of a failure. Every field is optional and bounded; none is a free-form string.
   */
  record Context(
      Environment environment, Http http, Upload upload, String detail, List<String> causes) {
    static final Context EMPTY = new Context(null, null, null, null, List.of());

    Context {
      detail = detail != null && CODE.matcher(detail).matches() ? detail : null;
      causes = List.copyOf(causes);
    }

    Context withHttp(Http value) {
      return new Context(environment, value, upload, detail, causes);
    }

    Context withUpload(Upload value) {
      return new Context(environment, http, value, detail, causes);
    }

    Context withDetail(String value) {
      return new Context(environment, http, upload, value, causes);
    }
  }

  private record Frame(String className, String methodName, String fileName, Integer lineNumber) {}

  private record ExceptionData(String type, List<Frame> frames) {
    ExceptionData {
      frames = List.copyOf(frames);
    }
  }

  private final UUID id;
  private final Instant occurredAt;
  private final Phase phase;
  private final Versions versions;
  private final UUID correlationId;
  private final ExceptionData exception;
  private final List<Breadcrumb> breadcrumbs;
  private final Context context;

  private DiagnosticReport(
      Phase phase,
      Versions versions,
      UUID correlationId,
      ExceptionData exception,
      List<Breadcrumb> breadcrumbs,
      Context context) {
    id = UUID.randomUUID();
    occurredAt = Instant.now();
    this.phase = Objects.requireNonNull(phase, "phase");
    this.versions = Objects.requireNonNull(versions, "versions");
    this.correlationId = Objects.requireNonNull(correlationId, "correlationId");
    this.exception = exception;
    this.breadcrumbs = List.copyOf(breadcrumbs);
    this.context = Objects.requireNonNull(context, "context");
  }

  static DiagnosticReport create(
      Phase phase,
      Versions versions,
      UUID correlationId,
      Throwable error,
      List<Breadcrumb> breadcrumbs) {
    return create(phase, versions, correlationId, error, breadcrumbs, Context.EMPTY);
  }

  /** The context the operation collected is completed with the environment and the cause chain. */
  static DiagnosticReport create(
      Phase phase,
      Versions versions,
      UUID correlationId,
      Throwable error,
      List<Breadcrumb> breadcrumbs,
      Context collected) {
    String detail = collected.detail();
    if (detail == null) detail = detailOf(error);
    Context context =
        new Context(
            Environment.current(), collected.http(), collected.upload(), detail, causes(error));
    return new DiagnosticReport(
        phase,
        versions,
        correlationId,
        sanitizeException(rootCause(error)),
        recentBreadcrumbs(breadcrumbs),
        context);
  }

  private static String detailOf(Throwable error) {
    Throwable current = error;
    for (int index = 0; current != null && index < 8; index++) {
      if (current instanceof Detailed detailed) {
        try {
          return detailed.diagnosticDetail();
        } catch (RuntimeException ignored) {
          return null;
        }
      }
      try {
        current = current.getCause();
      } catch (Throwable ignored) {
        return null;
      }
    }
    return null;
  }

  /** Types of the exceptions wrapped around the root cause, outermost first. */
  private static List<String> causes(Throwable error) {
    List<String> types = new ArrayList<>();
    Throwable current = error;
    var seen =
        java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<Throwable, Boolean>());
    for (int index = 0; current != null && index < 8 && seen.add(current); index++) {
      Throwable cause;
      try {
        cause = current.getCause();
      } catch (Throwable ignored) {
        break;
      }
      if (cause == null || seen.contains(cause)) break;
      if (types.size() < 6 && safeClassName(current.getClass().getName()))
        types.add(current.getClass().getName());
      current = cause;
    }
    return types;
  }

  /** Restore only typed fields; a modified local queue must never turn into a free-form upload. */
  static JsonObject restore(JsonObject payload, Instant now) {
    if (!payload.get("consent").getAsBoolean()) throw new IllegalArgumentException("consent");
    JsonObject report = payload.getAsJsonObject("report");
    UUID id = UUID.fromString(report.get("id").getAsString());
    Instant occurred = Instant.parse(report.get("occurredAt").getAsString());
    if (occurred.isBefore(now.minus(Duration.ofDays(7))) || occurred.isAfter(now.plusSeconds(300)))
      throw new IllegalArgumentException("expired");
    if (!"mod".equals(report.get("source").getAsString()))
      throw new IllegalArgumentException("source");
    Phase phase =
        Phase.valueOf(report.get("phase").getAsString().toUpperCase(java.util.Locale.ROOT));
    UUID correlation = UUID.fromString(report.get("correlationId").getAsString());
    JsonObject version = report.getAsJsonObject("versions");
    Versions versions =
        new Versions(
            version.get("mod").getAsString(),
            version.get("minecraft").getAsString(),
            version.get("loader").getAsString());
    JsonObject exception = report.getAsJsonObject("exception");
    String type = exception.get("type").getAsString();
    if (!safeClassName(type)) throw new IllegalArgumentException("exception");
    List<Frame> frames = new ArrayList<>();
    for (var value : exception.getAsJsonArray("frames")) {
      if (frames.size() == MAX_FRAMES) break;
      JsonObject frame = value.getAsJsonObject();
      Frame safe =
          sanitizeFrame(
              new StackTraceElement(
                  frame.get("className").getAsString(),
                  frame.get("methodName").getAsString(),
                  frame.has("fileName") ? frame.get("fileName").getAsString() : null,
                  frame.has("lineNumber") ? frame.get("lineNumber").getAsInt() : -1));
      if (safe != null) frames.add(safe);
    }
    List<Breadcrumb> breadcrumbs = new ArrayList<>();
    for (var value : report.getAsJsonArray("breadcrumbs")) {
      if (breadcrumbs.size() == MAX_BREADCRUMBS) break;
      JsonObject step = value.getAsJsonObject();
      breadcrumbs.add(
          new Breadcrumb(
              Step.valueOf(step.get("step").getAsString().toUpperCase(java.util.Locale.ROOT)),
              step.get("elapsedMs").getAsLong()));
    }
    JsonObject restored =
        new DiagnosticReport(
                phase,
                versions,
                correlation,
                new ExceptionData(type, frames),
                breadcrumbs,
                restoreContext(report.get("context")))
            .payload();
    restored.getAsJsonObject("report").addProperty("id", id.toString());
    restored.getAsJsonObject("report").addProperty("occurredAt", occurred.toString());
    return restored;
  }

  /** Rebuilds the typed context; a part that does not validate is dropped, never forwarded. */
  private static Context restoreContext(com.google.gson.JsonElement element) {
    if (element == null || !element.isJsonObject()) return Context.EMPTY;
    JsonObject json = element.getAsJsonObject();
    Environment environment = null;
    Http http = null;
    Upload upload = null;
    String detail = null;
    List<String> causes = new ArrayList<>();
    try {
      if (json.has("environment")) {
        JsonObject value = json.getAsJsonObject("environment");
        String os = value.get("os").getAsString();
        String arch = value.get("arch").getAsString();
        if (List.of("windows", "macos", "linux", "other").contains(os)
            && ARCH.matcher(arch).matches())
          environment =
              new Environment(
                  os,
                  arch,
                  safeVersion(value.get("java").getAsString()),
                  Math.max(0, Math.min(1_048_576, value.get("maxMemoryMb").getAsLong())),
                  Math.max(1, Math.min(1024, value.get("processors").getAsInt())));
      }
    } catch (RuntimeException ignored) {
      environment = null;
    }
    try {
      if (json.has("http")) {
        JsonObject value = json.getAsJsonObject("http");
        http =
            new Http(
                value.get("request").getAsString(),
                value.get("attempts").getAsInt(),
                value.has("status") ? value.get("status").getAsInt() : 0,
                value.has("error") ? value.get("error").getAsString() : null,
                value.has("retryAfterSeconds") ? value.get("retryAfterSeconds").getAsLong() : -1);
      }
    } catch (RuntimeException ignored) {
      http = null;
    }
    try {
      if (json.has("upload")) {
        JsonObject value = json.getAsJsonObject("upload");
        upload =
            new Upload(
                value.get("sizeBytes").getAsLong(),
                value.get("offsetBytes").getAsLong(),
                value.get("chunks").getAsInt());
      }
    } catch (RuntimeException ignored) {
      upload = null;
    }
    try {
      if (json.has("detail")) detail = json.get("detail").getAsString();
      if (json.has("causes"))
        for (var value : json.getAsJsonArray("causes"))
          if (causes.size() < 6 && safeClassName(value.getAsString()))
            causes.add(value.getAsString());
    } catch (RuntimeException ignored) {
      causes.clear();
    }
    return new Context(environment, http, upload, detail, causes);
  }

  private static Throwable rootCause(Throwable error) {
    Throwable current = error;
    var seen =
        java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<Throwable, Boolean>());
    for (int index = 0; current != null && index < 8 && seen.add(current); index++) {
      try {
        Throwable cause = current.getCause();
        if (cause == null || seen.contains(cause)) break;
        current = cause;
      } catch (Throwable ignored) {
        break;
      }
    }
    return current;
  }

  /** Returns a fresh JSON tree; neither the error nor a caller-owned collection is retained. */
  JsonObject payload() {
    JsonObject report = new JsonObject();
    report.addProperty("id", id.toString());
    report.addProperty("occurredAt", occurredAt.toString());
    report.addProperty("source", "mod");
    report.addProperty("phase", phase.value);
    report.addProperty("correlationId", correlationId.toString());
    JsonObject versionJson = new JsonObject();
    versionJson.addProperty("mod", versions.mod());
    versionJson.addProperty("minecraft", versions.minecraft());
    versionJson.addProperty("loader", versions.loader());
    report.add("versions", versionJson);
    JsonObject exceptionJson = new JsonObject();
    exceptionJson.addProperty("type", exception.type());
    JsonArray frames = new JsonArray();
    for (Frame frame : exception.frames()) {
      JsonObject json = new JsonObject();
      json.addProperty("className", frame.className());
      json.addProperty("methodName", frame.methodName());
      if (frame.fileName() != null) json.addProperty("fileName", frame.fileName());
      if (frame.lineNumber() != null) json.addProperty("lineNumber", frame.lineNumber());
      frames.add(json);
    }
    exceptionJson.add("frames", frames);
    report.add("exception", exceptionJson);
    JsonArray steps = new JsonArray();
    for (Breadcrumb breadcrumb : breadcrumbs) {
      JsonObject json = new JsonObject();
      json.addProperty("step", breadcrumb.step().value);
      json.addProperty("elapsedMs", breadcrumb.elapsedMs());
      steps.add(json);
    }
    report.add("breadcrumbs", steps);
    JsonObject contextJson = contextPayload();
    if (contextJson.size() > 0) report.add("context", contextJson);
    JsonObject payload = new JsonObject();
    payload.addProperty("consent", true);
    payload.add("report", report);
    return payload;
  }

  private JsonObject contextPayload() {
    JsonObject json = new JsonObject();
    if (context.environment() != null) {
      var value = context.environment();
      JsonObject environment = new JsonObject();
      environment.addProperty("os", value.os());
      environment.addProperty("arch", value.arch());
      environment.addProperty("java", value.javaVersion());
      environment.addProperty("maxMemoryMb", value.maxMemoryMb());
      environment.addProperty("processors", value.processors());
      json.add("environment", environment);
    }
    if (context.http() != null) {
      var value = context.http();
      JsonObject http = new JsonObject();
      http.addProperty("request", value.request());
      http.addProperty("attempts", value.attempts());
      if (value.status() != 0) http.addProperty("status", value.status());
      if (value.error() != null) http.addProperty("error", value.error());
      if (value.retryAfterSeconds() >= 0)
        http.addProperty("retryAfterSeconds", value.retryAfterSeconds());
      json.add("http", http);
    }
    if (context.upload() != null) {
      var value = context.upload();
      JsonObject upload = new JsonObject();
      upload.addProperty("sizeBytes", value.sizeBytes());
      upload.addProperty("offsetBytes", value.offsetBytes());
      upload.addProperty("chunks", value.chunks());
      json.add("upload", upload);
    }
    if (context.detail() != null) json.addProperty("detail", context.detail());
    if (!context.causes().isEmpty()) {
      JsonArray causes = new JsonArray();
      for (String type : context.causes()) causes.add(type);
      json.add("causes", causes);
    }
    return json;
  }

  private static ExceptionData sanitizeException(Throwable error) {
    String type = error == null ? null : error.getClass().getName();
    if (!safeClassName(type)) type = "java.lang.Throwable";
    List<Frame> frames = new ArrayList<>();
    if (error != null) {
      StackTraceElement[] trace;
      try {
        trace = error.getStackTrace();
      } catch (RuntimeException ignored) {
        // A mod-defined Throwable can override getStackTrace. Never include its error message.
        trace = null;
      }
      if (trace != null) {
        for (int index = 0;
            index < Math.min(trace.length, MAX_INSPECTED_FRAMES) && frames.size() < MAX_FRAMES;
            index++) {
          Frame frame = sanitizeFrame(trace[index]);
          if (frame != null) frames.add(frame);
        }
      }
    }
    return new ExceptionData(type, frames);
  }

  private static Frame sanitizeFrame(StackTraceElement frame) {
    if (frame == null || !safeClassName(frame.getClassName())) return null;
    String method = frame.getMethodName();
    if (method.length() > 80
        || !(METHOD_NAME.matcher(method).matches()
            || method.equals("<init>")
            || method.equals("<clinit>"))) return null;
    String fileName = frame.getFileName();
    if (fileName != null && (fileName.length() > 80 || !FILE_NAME.matcher(fileName).matches())) {
      // Omit paths entirely rather than publishing their basename, which may contain a username.
      fileName = null;
    }
    int line = frame.getLineNumber();
    Integer lineNumber = line < 0 || line > MAX_LINE_NUMBER ? null : line;
    return new Frame(frame.getClassName(), method, fileName, lineNumber);
  }

  private static boolean safeClassName(String value) {
    if (value == null || value.length() > 160 || !CLASS_NAME.matcher(value).matches()) return false;
    for (String prefix : SAFE_NAMESPACES) {
      if (value.startsWith(prefix)) return true;
    }
    return false;
  }

  private static String safeVersion(String value) {
    return value != null && value.length() <= 64 && VERSION.matcher(value).matches()
        ? value
        : "unknown";
  }

  private static List<Breadcrumb> recentBreadcrumbs(List<Breadcrumb> values) {
    if (values == null) return List.of();
    List<Breadcrumb> result = new ArrayList<>();
    for (int index = Math.max(0, values.size() - MAX_BREADCRUMBS); index < values.size(); index++) {
      Breadcrumb value = values.get(index);
      if (value != null) result.add(value);
    }
    return result;
  }
}
