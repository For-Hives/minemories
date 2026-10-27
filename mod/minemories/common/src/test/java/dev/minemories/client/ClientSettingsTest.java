package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermission;
import java.util.Properties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ClientSettingsTest {
  @TempDir Path temporary;

  private Properties paired() {
    Properties settings = new Properties();
    settings.setProperty("deviceToken", "private-token");
    settings.setProperty("deviceId", "device");
    settings.setProperty("afkSnapshots", "true");
    return settings;
  }

  @Test
  void officialApiIsTheDefaultAndOverridesArePreserved() {
    Properties settings = new Properties();
    assertEquals(ClientSettings.DEFAULT_API_URL, ClientSettings.apiUrl(settings, null));
    assertEquals(ClientSettings.DEFAULT_API_URL, ClientSettings.apiUrl(settings, " "));
    assertEquals(
        "http://localhost:3001", ClientSettings.apiUrl(settings, "http://localhost:3001/"));
    settings.setProperty("apiUrl", " https://private.example/api/// ");
    assertEquals(
        "https://private.example/api", ClientSettings.apiUrl(settings, "https://other.example"));
    settings.setProperty("apiUrl", " ");
    assertEquals(ClientSettings.DEFAULT_API_URL, ClientSettings.apiUrl(settings, null));
  }

  @Test
  void refusesUnsafeOrMalformedApiAddresses() {
    for (String value :
        new String[] {
          "",
          "not a url",
          "file:///tmp/api",
          "http://remote.example",
          "https://user:password@example.com",
          "https://example.com?token=secret",
          "https://example.com#fragment"
        }) {
      assertThrows(IllegalArgumentException.class, () -> ClientSettings.normalizeApiUrl(value));
    }
    assertEquals("http://127.0.0.1:3001", ClientSettings.normalizeApiUrl("http://127.0.0.1:3001"));
    assertEquals("http://[::1]:3001", ClientSettings.normalizeApiUrl("http://[::1]:3001"));
  }

  @Test
  void changingApiRemovesCredentialsButPreservesLocalAfk() {
    Properties settings = paired();
    settings.setProperty("diagnosticsConsent", "true");
    assertTrue(
        ClientSettings.configure(
            settings,
            ClientSettings.DEFAULT_API_URL,
            "https://private.example/",
            temporary.toString(),
            temporary));
    assertNull(settings.getProperty("deviceToken"));
    assertNull(settings.getProperty("deviceId"));
    assertFalse(settings.containsKey("diagnosticsConsent"));
    assertFalse(ClientSettings.diagnosticsRefused(settings));
    assertTrue(ClientSettings.afkSnapshots(settings));
    assertEquals("https://private.example", settings.getProperty("apiUrl"));
  }

  @Test
  void changingOnlyTheLocalFolderPreservesTheAccount() {
    Properties settings = paired();
    settings.setProperty("diagnosticsConsent", "true");
    assertFalse(
        ClientSettings.configure(
            settings,
            ClientSettings.DEFAULT_API_URL,
            ClientSettings.DEFAULT_API_URL + "/",
            "~/souvenirs",
            temporary));
    assertEquals("private-token", settings.getProperty("deviceToken"));
    assertTrue(ClientSettings.diagnosticsConsent(settings));
    assertTrue(ClientSettings.afkSnapshots(settings));
    assertEquals(
        temporary.resolve("souvenirs"), ClientSettings.exportDirectory(settings, temporary));
  }

  @Test
  void invalidConfigurationDoesNotPartiallyChangeTheAccount() {
    Properties settings = paired();
    assertThrows(
        IllegalArgumentException.class,
        () ->
            ClientSettings.configure(
                settings,
                ClientSettings.DEFAULT_API_URL,
                "https://private.example",
                "relative/path",
                temporary));
    assertEquals("private-token", settings.getProperty("deviceToken"));
    assertNull(settings.getProperty("apiUrl"));
  }

  @Test
  void localPathsAndAutomaticUploadDefaultsAreExplicit() {
    Properties settings = new Properties();
    assertEquals(temporary.resolve("export"), ClientSettings.exportDirectory(settings, temporary));
    assertTrue(ClientSettings.afkSnapshots(settings));
    settings.setProperty("exportDirectory", "~");
    assertEquals(temporary, ClientSettings.exportDirectory(settings, temporary));
    settings.setProperty("exportDirectory", temporary.resolve("a/../b").toString());
    assertEquals(temporary.resolve("b"), ClientSettings.exportDirectory(settings, temporary));
    settings.setProperty("afkSnapshots", "TRUE");
    assertTrue(ClientSettings.afkSnapshots(settings));
  }

  @Test
  void storesSettingsAtomicallyWithPrivatePermissions() throws IOException {
    Path path = temporary.resolve("config/minemories.properties");
    assertTrue(ClientSettings.read(path).isEmpty());
    Properties settings = paired();
    ClientSettings.save(path, settings);
    assertEquals(settings, ClientSettings.read(path));
    assertFalse(Files.exists(path.resolveSibling("minemories.properties.tmp")));
    settings.setProperty("exportDirectory", temporary.resolve("créations").toString());
    ClientSettings.save(path, settings);
    assertEquals(settings, ClientSettings.read(path));
    if (Files.getFileStore(path).supportsFileAttributeView("posix")) {
      assertEquals(
          java.util.Set.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE),
          Files.getPosixFilePermissions(path));
    }
  }

  @Test
  void afkOptionsHaveProductionDefaultsAndPersistValidatedOverrides() {
    Properties settings = new Properties();
    assertEquals(new ClientSettings.AfkOptions(5, 240, 32), ClientSettings.afkOptions(settings));
    var custom = new ClientSettings.AfkOptions(1, 10, 64);
    ClientSettings.configureAfk(settings, custom);
    assertEquals(custom, ClientSettings.afkOptions(settings));
    settings.setProperty("afkIdleMinutes", "broken");
    assertEquals(new ClientSettings.AfkOptions(5, 240, 32), ClientSettings.afkOptions(settings));
    assertThrows(IllegalArgumentException.class, () -> new ClientSettings.AfkOptions(0, 10, 32));
    assertThrows(IllegalArgumentException.class, () -> new ClientSettings.AfkOptions(1, 10081, 32));
    assertThrows(IllegalArgumentException.class, () -> new ClientSettings.AfkOptions(1, 10, 129));
    settings.setProperty("afkSnapshots", "false");
    assertFalse(ClientSettings.afkSnapshots(settings));
  }

  @Test
  void fullHeightCaptureIsAnExplicitAdvancedOverride() {
    Properties settings = new Properties();
    assertFalse(ClientSettings.fullHeightCapture(settings));
    settings.setProperty("captureFullHeight", "true");
    assertTrue(ClientSettings.fullHeightCapture(settings));
  }

  @Test
  void captureTilesAreOnByDefaultWithBoundedChunkSize() {
    Properties settings = new Properties();
    assertEquals(4, ClientSettings.captureTileChunks(settings));
    settings.setProperty("captureTiles", "false");
    assertEquals(0, ClientSettings.captureTileChunks(settings));
    settings.setProperty("captureTiles", "true");
    assertEquals(4, ClientSettings.captureTileChunks(settings));
    settings.setProperty("captureTiles", "TRUE");
    assertEquals(4, ClientSettings.captureTileChunks(settings));
    settings.setProperty("captureTileChunks", "8");
    assertEquals(8, ClientSettings.captureTileChunks(settings));
    settings.setProperty("captureTileChunks", "16");
    assertEquals(16, ClientSettings.captureTileChunks(settings));
    for (String invalid : new String[] {"0", "17", "-1", "broken", ""}) {
      settings.setProperty("captureTileChunks", invalid);
      assertEquals(4, ClientSettings.captureTileChunks(settings));
    }
    settings.setProperty("captureTiles", "yes");
    settings.setProperty("captureTileChunks", "4");
    assertEquals(0, ClientSettings.captureTileChunks(settings));
  }

  @Test
  void diagnosticsDefaultToOnForAnAbsentKeyAndPersistExplicitChoices() throws IOException {
    Properties settings = paired();
    assertTrue(ClientSettings.diagnosticsConsentForIdentity(settings, null));
    assertFalse(ClientSettings.diagnosticsRefused(settings));
    assertEquals(
        ClientSettings.diagnosticsBinding(settings, null),
        ClientSettings.diagnosticsIdentityKey(settings, null));
    settings.setProperty("diagnosticsConsent", "true");
    settings.setProperty("diagnosticsIdentity", ClientSettings.diagnosticsBinding(settings, null));
    Path path = temporary.resolve("config/minemories.properties");
    ClientSettings.save(path, settings);
    assertTrue(ClientSettings.diagnosticsConsentForIdentity(ClientSettings.read(path), null));
    settings.setProperty("diagnosticsConsent", "false");
    ClientSettings.save(path, settings);
    assertFalse(ClientSettings.diagnosticsConsentForIdentity(ClientSettings.read(path), null));
  }

  @Test
  void anyValueOtherThanExactTrueIsRefused() {
    Properties settings = paired();
    for (String refused : new String[] {"false", "FALSE", "yes", "1", ""}) {
      settings.setProperty("diagnosticsConsent", refused);
      assertTrue(ClientSettings.diagnosticsRefused(settings), refused);
      assertFalse(ClientSettings.diagnosticsConsentForIdentity(settings, null), refused);
      assertFalse(ClientSettings.diagnosticsConsent(settings), refused);
    }
    settings.setProperty("diagnosticsConsent", "TRUE");
    assertTrue(ClientSettings.diagnosticsRefused(settings));
    settings.remove("diagnosticsConsent");
    assertFalse(ClientSettings.diagnosticsRefused(settings));
  }

  @Test
  void defaultIdentityChangesWithTheTokenSoThePreviousOutboxIsPurged() {
    Properties settings = paired();
    String before = ClientSettings.diagnosticsIdentityKey(settings, null);
    settings.setProperty("deviceToken", "rotated-token");
    assertNotEquals(before, ClientSettings.diagnosticsIdentityKey(settings, null));
  }

  @Test
  void diagnosticsEpochDependsOnWhetherConsentIsExplicit() {
    Properties settings = paired();
    assertEquals("default", ClientSettings.diagnosticsEpoch(settings));
    settings.setProperty("diagnosticsConsent", "true");
    assertEquals("legacy", ClientSettings.diagnosticsEpoch(settings));
    settings.setProperty("diagnosticsEpoch", "epoch-1");
    assertEquals("epoch-1", ClientSettings.diagnosticsEpoch(settings));
  }

  @Test
  void explicitIdentityKeyIsTheStoredIdentity() {
    Properties settings = paired();
    settings.setProperty("diagnosticsConsent", "true");
    settings.setProperty("diagnosticsIdentity", "stored");
    assertEquals("stored", ClientSettings.diagnosticsIdentityKey(settings, null));
  }

  @Test
  void forgetBoundDiagnosticsKeepsAnExplicitRefusal() {
    Properties refused = paired();
    refused.setProperty("diagnosticsConsent", "false");
    refused.setProperty("diagnosticsIdentity", "old");
    refused.setProperty("diagnosticsEpoch", "epoch");
    ClientSettings.forgetBoundDiagnostics(refused);
    assertEquals("false", refused.getProperty("diagnosticsConsent"));
    assertNull(refused.getProperty("diagnosticsIdentity"));
    assertNull(refused.getProperty("diagnosticsEpoch"));
    assertTrue(ClientSettings.diagnosticsRefused(refused));

    Properties explicit = paired();
    explicit.setProperty("diagnosticsConsent", "true");
    explicit.setProperty("diagnosticsIdentity", "old");
    ClientSettings.forgetBoundDiagnostics(explicit);
    assertFalse(explicit.containsKey("diagnosticsConsent"));
    assertFalse(explicit.containsKey("diagnosticsIdentity"));
  }

  @Test
  void changingApiKeepsAnExplicitRefusalButDropsAnExplicitConsent() {
    Properties refused = paired();
    refused.setProperty("diagnosticsConsent", "false");
    ClientSettings.configure(
        refused,
        ClientSettings.DEFAULT_API_URL,
        "https://other.example",
        temporary.toString(),
        temporary);
    assertEquals("false", refused.getProperty("diagnosticsConsent"));
    assertTrue(ClientSettings.diagnosticsRefused(refused));

    Properties accepted = paired();
    accepted.setProperty("diagnosticsConsent", "true");
    accepted.setProperty("diagnosticsIdentity", "old");
    ClientSettings.configure(
        accepted,
        ClientSettings.DEFAULT_API_URL,
        "https://other.example",
        temporary.toString(),
        temporary);
    assertFalse(accepted.containsKey("diagnosticsConsent"));
    assertFalse(accepted.containsKey("diagnosticsIdentity"));
  }

  @Test
  void pairingReminderIsOnUnlessExplicitlyDisabled() {
    Properties settings = new Properties();
    assertTrue(ClientSettings.pairingReminder(settings));
    settings.setProperty("pairingReminder", "false");
    assertFalse(ClientSettings.pairingReminder(settings));
    settings.setProperty("pairingReminder", "FALSE");
    assertFalse(ClientSettings.pairingReminder(settings));
    for (String enabled : new String[] {"true", "no", ""}) {
      settings.setProperty("pairingReminder", enabled);
      assertTrue(ClientSettings.pairingReminder(settings), enabled);
    }
  }

  @Test
  void diagnosticsConsentIsBoundToApiDeviceAndTokenWithoutPersistingASecondToken() {
    Properties settings = paired();
    settings.setProperty("diagnosticsConsent", "true");
    assertFalse(ClientSettings.diagnosticsConsentForIdentity(settings, null));
    String binding = ClientSettings.diagnosticsBinding(settings, null);
    assertTrue(binding.matches("[0-9a-f]{64}"));
    settings.setProperty("diagnosticsIdentity", binding);
    assertTrue(ClientSettings.diagnosticsConsentForIdentity(settings, null));
    for (String field : new String[] {"apiUrl", "deviceId", "deviceToken"}) {
      Properties changed = new Properties();
      changed.putAll(settings);
      changed.setProperty(field, field.equals("apiUrl") ? "https://other.example" : "changed");
      assertFalse(ClientSettings.diagnosticsConsentForIdentity(changed, null));
    }
  }

  @Test
  void remoteWorldNamespacesAreExplicitEndpointScopedAndPreservePrivatePreferences()
      throws IOException {
    Properties settings = paired();
    assertEquals("", ClientSettings.remoteWorldNamespace(settings, "a:25565"));
    String id = "abcdef12-3456-4789-8abc-def012345678";
    ClientSettings.configureRemoteWorld(
        settings, "a:25565", " " + id.toUpperCase(java.util.Locale.ROOT) + " ");
    assertEquals(id, ClientSettings.remoteWorldNamespace(settings, "a:25565"));
    assertEquals("", ClientSettings.remoteWorldNamespace(settings, "b:25565"));
    assertEquals("private-token", settings.getProperty("deviceToken"));
    assertTrue(ClientSettings.afkSnapshots(settings));
    Path path = temporary.resolve("config/minemories.properties");
    ClientSettings.save(path, settings);
    assertEquals(id, ClientSettings.remoteWorldNamespace(ClientSettings.read(path), "a:25565"));
    assertFalse(ClientSettings.configureRemoteWorld(settings, "a:25565", id));
    assertTrue(ClientSettings.configureRemoteWorld(settings, "a:25565", ""));
    assertEquals("", ClientSettings.remoteWorldNamespace(settings, "a:25565"));
    assertEquals("private-token", settings.getProperty("deviceToken"));
    for (String invalid : new String[] {"world", "1-1-1-1-1", id + "x"})
      assertThrows(
          IllegalArgumentException.class,
          () -> ClientSettings.configureRemoteWorld(settings, "a", invalid));
    settings.setProperty(CaptureIdentity.remoteSettingsKey("a"), "invalid");
    assertThrows(
        IllegalArgumentException.class, () -> ClientSettings.remoteWorldNamespace(settings, "a"));
    assertTrue(ClientSettings.configureRemoteWorld(settings, "a", ""));
    assertEquals("", ClientSettings.remoteWorldNamespace(settings, "a"));
  }
}
