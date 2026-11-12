package dev.minemories.gametest;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BooleanSupplier;

/**
 * What the in-game tests check after the capture, beyond the GLB: nothing leaves the machine before pairing, the
 * pairing code exchange, the resumable upload, the diagnostics report, and the selection commands. It talks to the
 * mod only through its real commands and its own files, against a mock API on 127.0.0.1, so it has no Minecraft
 * dependency and every loader's driver runs the same script (see {@link Host}).
 */
public final class FeatureScenario {
  static final String CODE = "123456";
  static final String TOKEN = "mock-device-token";
  private static final long TICK_LIMIT = 20 * 45;

  /** What a loader's driver gives the script: its two command channels and the game folder. */
  public interface Host {
    /** A client command, as typed in chat (without the slash): "minemories pair 123456". */
    void client(String command);

    /** A server command run as the operator: "tp @p 0 -60 0 0 90". */
    void server(String command);
  }

  /** One request the mock API received. */
  record Request(String method, String path, Map<String, String> headers, byte[] body) {
    String text() {
      return new String(body, StandardCharsets.UTF_8);
    }
  }

  private record Step(String name, Runnable action, BooleanSupplier until, long timeoutTicks) {}

  private final Path gameDir;
  private final Path config;
  private final Path export;
  private final HttpServer server;
  private final List<Request> requests = new CopyOnWriteArrayList<>();
  private final Map<String, ByteArrayOutputStream> uploads = new ConcurrentHashMap<>();
  private final List<String> completed = new CopyOnWriteArrayList<>();
  private volatile boolean acceptCode;
  private volatile boolean failChunks;
  private final List<Step> steps = new ArrayList<>();
  private Host host;
  private int index;
  private long ticksInStep = -1;
  private String latestCaptureJson = "";
  private String uploadedBody = "";
  private long uploadsBefore;

  /** Starts the mock API and points the mod's configuration at it. */
  public FeatureScenario(Path gameDir) throws IOException {
    this.gameDir = gameDir.toAbsolutePath().normalize();
    this.config = this.gameDir.resolve("config").resolve("minemories.properties");
    this.export = GlbReport.exportedGlb().getParent();
    server = HttpServer.create(new InetSocketAddress(InetAddress.getByAddress(new byte[] {127, 0, 0, 1}), 0), 0);
    server.createContext("/", this::handle);
    server.start();
    Properties properties = new Properties();
    properties.setProperty("apiUrl", "http://127.0.0.1:" + server.getAddress().getPort());
    Files.createDirectories(config.getParent());
    // State of an earlier run (consent, outbox) must not start this one "paired".
    Files.deleteIfExists(config.resolveSibling("minemories-diagnostics.properties"));
    try (OutputStream out = Files.newOutputStream(config)) {
      properties.store(out, "in-game test: mock API");
    }
    plan();
  }

  public void close() {
    server.stop(0);
    Path keep = export.resolve("area.glb.keep");
    if (Files.exists(keep)) {
      try {
        Files.move(keep, export.resolve("capture.glb"), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
      } catch (IOException ignored) {
        // The run is already over; the area capture is only kept for the runner's statistics.
      }
    }
  }

  /** Advances the script by one client tick. Returns true when it is finished; throws AssertionError on failure. */
  public boolean tick(Host host) {
    this.host = host;
    if (index >= steps.size()) return true;
    Step step = steps.get(index);
    if (ticksInStep < 0) {
      step.action.run();
      ticksInStep = 0;
    }
    ticksInStep++;
    if (step.until.getAsBoolean()) {
      index++;
      ticksInStep = -1;
    } else if (ticksInStep > step.timeoutTicks) {
      throw new AssertionError("Feature step timed out: " + step.name + " (requests: " + summary() + ")");
    }
    return index >= steps.size();
  }

  // ---- the script ---------------------------------------------------------------------------------------------

  private void plan() {
    // Nothing leaves the machine before pairing, not even with the API configured.
    step("upload before pairing", () -> host.client("minemories upload"), after(30));
    step("malformed code", () -> host.client("minemories pair abc"), after(20));
    step(
        "no request before pairing",
        () -> {
          require(requests.isEmpty(), "requests were sent before pairing: " + summary());
          require(token().isEmpty(), "a device token exists before pairing");
        },
        after(1));

    // A refused code stores nothing.
    step("pair with a refused code", () -> host.client("minemories pair 000000"), () -> count("POST", "/api/mod/pair") == 1, 400);
    step(
        "refused code stores nothing",
        () -> require(token().isEmpty(), "a refused code stored a device token"),
        after(20));

    // The right code exchanges for a token that is saved and then used as the bearer.
    step(
        "pair with the code",
        () -> {
          acceptCode = true;
          host.client("minemories pair " + CODE);
        },
        () -> TOKEN.equals(token()),
        400);
    step(
        "pairing request content",
        () -> {
          Request pair = last("POST", "/api/mod/pair");
          JsonObject body = JsonParser.parseString(pair.text()).getAsJsonObject();
          require(CODE.equals(body.get("code").getAsString()), "pair body lacks the code");
        },
        after(1));
    step(
        "diagnostics consent after linking",
        () -> {},
        () -> count("POST", "/api/mod/diagnostics/consent") >= 1,
        TICK_LIMIT);
    step(
        "consent is authenticated",
        () ->
            require(
                ("Bearer " + TOKEN).equals(last("POST", "/api/mod/diagnostics/consent").headers.get("authorization")),
                "consent request without the device token"),
        after(1));

    // The paired upload sends the exact bytes of the capture, in the documented session/chunk/complete order.
    step("upload", () -> host.client("minemories upload"), () -> !completed.isEmpty(), TICK_LIMIT);
    step(
        "uploaded bytes match the capture",
        () -> {
          String id = completed.get(0);
          byte[] sent = uploads.get(id).toByteArray();
          byte[] capture = readLatestCapture();
          require(sha(sent).equals(sha(capture)), "uploaded bytes differ from the capture on disk");
          Request init = last("POST", "/api/mod/uploads");
          require(("Bearer " + TOKEN).equals(init.headers.get("authorization")), "upload without the device token");
          JsonObject session = JsonParser.parseString(init.text()).getAsJsonObject();
          require(session.get("size").getAsLong() == capture.length, "upload size differs");
          require(sha(capture).equals(session.get("sha256").getAsString()), "upload checksum differs");
          require(session.has("metadata"), "upload without metadata");
          uploadedBody = init.text();
        },
        after(1));

    // A failing upload sends a sanitized diagnostic report (consent is on by default once linked).
    // The client may still be finishing the previous upload ("already running"): send again until the API sees a new one.
    step(
        "failing upload",
        () -> {
          failChunks = true;
          uploadsBefore = count("POST", "/api/mod/uploads");
          host.client("minemories upload");
        },
        () -> {
          if (count("POST", "/api/mod/diagnostics") >= 1) return true;
          if (ticksInStep % 40 == 0 && count("POST", "/api/mod/uploads") == uploadsBefore) host.client("minemories upload");
          return false;
        },
        TICK_LIMIT * 2);
    step(
        "diagnostic report is sanitized",
        () -> {
          Request report = last("POST", "/api/mod/diagnostics");
          String text = report.text();
          require(text.contains("\"upload\""), "the report does not name the upload phase");
          require(!text.contains(TOKEN), "the report carries the device token");
          require(!text.contains(System.getProperty("user.home")), "the report carries a local path");
          require(!text.contains(gameDir.toString()), "the report carries the game folder");
          require(report.headers.containsKey("x-minemories-diagnostics-permit"), "the report lacks its permit");
        },
        after(1));
    step("upload recovers", () -> failChunks = false, after(1));

    // Selection: two corners with the crosshair, status, an export of exactly that box, then clear.
    step("look at the first corner", () -> host.server("tp @p 0.5 -60 0.5 0 90"), after(30));
    step("first corner", () -> host.client("minemories select first"), after(10));
    step("look at the second corner", () -> host.server("tp @p 0.5 -60 6.5 0 90"), after(30));
    step("second corner", () -> host.client("minemories select second"), after(10));
    step("selection status", () -> host.client("minemories select status"), after(10));
    step(
        "export the selection",
        () -> {
          // The harness checks the area capture's statistics afterwards: keep it aside, put it back at the end.
          copy(export.resolve("capture.glb"), export.resolve("area.glb.keep"));
          latestCaptureJson = read(export.resolve("capture.json"));
          host.client("minemories export selection");
        },
        () -> !read(export.resolve("capture.json")).equals(latestCaptureJson) && Files.exists(export.resolve("capture.glb")),
        TICK_LIMIT * 2);
    step(
        "selection bounds",
        () -> {
          JsonObject bounds =
              JsonParser.parseString(read(export.resolve("capture.json")))
                  .getAsJsonObject()
                  .getAsJsonObject("captureBounds");
          require(
              "selection"
                  .equals(
                      JsonParser.parseString(read(export.resolve("capture.json")))
                          .getAsJsonObject()
                          .get("captureMode")
                          .getAsString()),
              "the export is not a selection capture");
          require(
              bounds.get("minX").getAsInt() == 0 && bounds.get("maxX").getAsInt() == 0,
              "selection X bounds are not the corners: " + bounds);
          require(
              bounds.get("minZ").getAsInt() == 0 && bounds.get("maxZ").getAsInt() == 6,
              "selection Z bounds are not the corners: " + bounds);
          latestCaptureJson = read(export.resolve("capture.json"));
        },
        after(1));
    step("clear the selection", () -> host.client("minemories select clear"), after(10));
    step("export without a selection", () -> host.client("minemories export selection"), after(40));
    step(
        "nothing exported without a selection",
        () -> require(read(export.resolve("capture.json")).equals(latestCaptureJson), "an export ran with no selection"),
        after(1));
    step(
        "put the area capture back",
        () -> copy(export.resolve("area.glb.keep"), export.resolve("capture.glb")),
        after(1));
    step(
        "every authenticated call used the device token",
        () -> {
          for (Request request : requests) {
            if (request.path.equals("/api/mod/pair")) continue;
            require(
                ("Bearer " + TOKEN).equals(request.headers.get("authorization")),
                request.method + " " + request.path + " was not authenticated");
          }
          require(!uploadedBody.isEmpty(), "the upload check did not run");
        },
        after(1));
  }

  private void step(String name, Runnable action, BooleanSupplier until, long timeoutTicks) {
    steps.add(new Step(name, action, until, timeoutTicks));
  }

  private void step(String name, Runnable action, After wait) {
    steps.add(new Step(name, action, wait, wait.ticks + 10));
  }

  /** A condition that holds after a number of ticks in the current step. */
  private final class After implements BooleanSupplier {
    final long ticks;

    After(long ticks) {
      this.ticks = ticks;
    }

    @Override
    public boolean getAsBoolean() {
      return ticksInStep >= ticks;
    }
  }

  private After after(long ticks) {
    return new After(ticks);
  }

  // ---- helpers ------------------------------------------------------------------------------------------------

  private static void require(boolean condition, String message) {
    if (!condition) throw new AssertionError(message);
  }

  private String token() {
    try {
      if (!Files.exists(config)) return "";
      Properties properties = new Properties();
      try (InputStream in = Files.newInputStream(config)) {
        properties.load(in);
      }
      return properties.getProperty("deviceToken", "");
    } catch (IOException error) {
      throw new AssertionError("Unreadable mod configuration: " + error, error);
    }
  }

  private static void copy(Path from, Path to) {
    try {
      Files.copy(from, to, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    } catch (IOException error) {
      throw new AssertionError("Cannot copy " + from + ": " + error, error);
    }
  }

  private static String read(Path file) {
    try {
      return Files.exists(file) ? Files.readString(file) : "";
    } catch (IOException error) {
      return "";
    }
  }

  private byte[] readLatestCapture() {
    try {
      return Files.readAllBytes(export.resolve("capture.glb"));
    } catch (IOException error) {
      throw new AssertionError("Unreadable capture: " + error, error);
    }
  }

  private static String sha(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (java.security.NoSuchAlgorithmException error) {
      throw new AssertionError(error);
    }
  }

  private long count(String method, String path) {
    return requests.stream().filter(r -> r.method.equals(method) && r.path.equals(path)).count();
  }

  private Request last(String method, String path) {
    for (int i = requests.size() - 1; i >= 0; i--) {
      Request request = requests.get(i);
      if (request.method.equals(method) && request.path.equals(path)) return request;
    }
    throw new AssertionError("No " + method + " " + path + " (requests: " + summary() + ")");
  }

  private String summary() {
    StringBuilder out = new StringBuilder();
    for (Request request : requests) out.append(request.method).append(' ').append(request.path).append("; ");
    return out.toString();
  }

  // ---- the mock API -------------------------------------------------------------------------------------------

  private void handle(HttpExchange exchange) throws IOException {
    String method = exchange.getRequestMethod();
    String path = exchange.getRequestURI().getPath();
    byte[] body = exchange.getRequestBody().readAllBytes();
    Map<String, String> headers = new ConcurrentHashMap<>();
    exchange.getRequestHeaders().forEach((name, values) -> headers.put(name.toLowerCase(java.util.Locale.ROOT), values.get(0)));
    requests.add(new Request(method, path, headers, body));
    boolean authenticated = ("Bearer " + TOKEN).equals(headers.get("authorization"));
    try {
      if (method.equals("POST") && path.equals("/api/mod/pair")) {
        JsonObject payload = JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject();
        if (acceptCode && CODE.equals(payload.get("code").getAsString()))
          reply(exchange, 200, "{\"deviceToken\":\"" + TOKEN + "\",\"deviceId\":\"" + UUID.randomUUID() + "\"}");
        else reply(exchange, 400, "{\"error\":\"invalid_code\"}");
      } else if (!authenticated) {
        reply(exchange, 401, "{\"error\":\"unauthorized\"}");
      } else if (method.equals("POST") && path.equals("/api/mod/diagnostics/consent")) {
        reply(exchange, 200, "{\"permit\":\"" + UUID.randomUUID() + "\"}");
      } else if (path.equals("/api/mod/diagnostics")) {
        reply(exchange, 200, "{}");
      } else if (method.equals("POST") && path.equals("/api/mod/uploads")) {
        JsonObject payload = JsonParser.parseString(new String(body, StandardCharsets.UTF_8)).getAsJsonObject();
        uploads.putIfAbsent(payload.get("id").getAsString(), new ByteArrayOutputStream());
        reply(exchange, 200, "{\"offset\":0,\"chunkSize\":4194304,\"completed\":false}");
      } else if (method.equals("PUT") && path.startsWith("/api/mod/uploads/")) {
        String id = path.substring("/api/mod/uploads/".length());
        long offset = Long.parseLong(headers.get("upload-offset"));
        ByteArrayOutputStream received = uploads.get(id);
        if (failChunks || received == null || received.size() != offset)
          reply(exchange, failChunks ? 500 : 409, "{\"error\":\"" + (failChunks ? "mock_failure" : "bad_offset") + "\"}");
        else {
          received.write(body);
          reply(exchange, 200, "{\"offset\":" + (offset + body.length) + "}");
        }
      } else if (method.equals("POST") && path.endsWith("/complete")) {
        String id = path.substring("/api/mod/uploads/".length(), path.length() - "/complete".length());
        completed.add(id);
        reply(exchange, 200, "{\"id\":\"" + id + "\"}");
      } else {
        reply(exchange, 404, "{\"error\":\"not_found\"}");
      }
    } catch (RuntimeException error) {
      reply(exchange, 400, "{\"error\":\"bad_request\"}");
    }
  }

  private static void reply(HttpExchange exchange, int status, String json) throws IOException {
    byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().set("Content-Type", "application/json");
    exchange.sendResponseHeaders(status, bytes.length);
    try (OutputStream out = exchange.getResponseBody()) {
      out.write(bytes);
    }
  }
}
