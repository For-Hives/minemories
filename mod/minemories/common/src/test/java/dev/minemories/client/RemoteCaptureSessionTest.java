package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

final class RemoteCaptureSessionTest {
  @Test
  void eachConnectionGetsANewNamespaceAndDisconnectDoesNotRetainItsIdentity() {
    var sessions = new RemoteCaptureSession();
    Object connection = new Object();
    String first = sessions.namespace(connection);
    assertTrue(first.matches("[a-f0-9-]{36}"));
    assertEquals(first, sessions.namespace(connection));
    sessions.clear();
    assertNotEquals(first, sessions.namespace(connection));
    assertNotEquals(sessions.namespace(connection), sessions.namespace(new Object()));
    assertThrows(NullPointerException.class, () -> sessions.namespace(null));
  }

  @Test
  void explicitNamespacesAreStableButNeverCollideWithSessionsOrOtherEndpointDimensionPlayer() {
    String namespace = "11111111-1111-4111-8111-111111111111";
    String first = CaptureIdentity.remote("server:25565", "overworld", "player", namespace, true);
    assertEquals(
        first, CaptureIdentity.remote("server:25565", "overworld", "player", namespace, true));
    assertNotEquals(
        first, CaptureIdentity.remote("server:25565", "overworld", "player", namespace, false));
    assertNotEquals(
        first, CaptureIdentity.remote("other:25565", "overworld", "player", namespace, true));
    assertNotEquals(
        first, CaptureIdentity.remote("server:25565", "nether", "player", namespace, true));
    assertNotEquals(
        first, CaptureIdentity.remote("server:25565", "overworld", "other", namespace, true));
    assertNotEquals(
        first, CaptureIdentity.remote("server:25565", "overworld", "player", "new-map", true));
    assertNotEquals(
        first, CaptureIdentity.world("server:server:25565", null, "overworld", "player"));
  }

  @Test
  void bindingReadsConfigurationOnlyWhenItsContextChangesAndRetainsTheSessionNonce() {
    var session = new RemoteCaptureSession();
    Object connection = new Object();
    var reads = new java.util.concurrent.atomic.AtomicInteger();
    java.util.function.Supplier<String> empty =
        () -> {
          reads.incrementAndGet();
          return "";
        };
    var first = session.binding(connection, "server", empty);
    assertFalse(first.configured());
    assertSame(first, session.binding(connection, "server", empty));
    assertEquals(1, reads.get());
    session.settingsChanged();
    assertEquals(first.namespace(), session.binding(connection, "server", empty).namespace());
    assertEquals(2, reads.get());
    session.settingsChanged();
    assertEquals(
        new RemoteCaptureSession.Binding("pinned", true),
        session.binding(connection, "server", () -> "pinned"));
    assertEquals("other", session.binding(connection, "other-server", () -> "other").namespace());
    assertSame(connection, session.connection());
    session.clear();
    assertNull(session.connection());
  }

  @Test
  void temporaryHistorySurvivesDimensionReturnButIsBoundedAndClearedWithTheConnection() {
    var session = new RemoteCaptureSession();
    Object connection = new Object();
    session.namespace(connection);
    var overworld = java.nio.file.Path.of("overworld");
    var known = session.exploration(overworld);
    session.exploration(java.nio.file.Path.of("nether"));
    assertSame(known, session.exploration(overworld));
    for (int i = 0; i < 8; i++) session.exploration(java.nio.file.Path.of("dimension-" + i));
    assertNotSame(known, session.exploration(overworld));
    var current = session.exploration(overworld);
    session.namespace(new Object());
    assertNotSame(current, session.exploration(overworld));
    current = session.exploration(overworld);
    session.clear();
    assertNotSame(current, session.exploration(overworld));
  }
}
