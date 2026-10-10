package dev.minemories.neoforge;

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
    assertTrue(
        ClientSettings.configure(
            settings,
            ClientSettings.DEFAULT_API_URL,
            "https://private.example/",
            temporary.toString(),
            temporary));
    assertNull(settings.getProperty("deviceToken"));
    assertNull(settings.getProperty("deviceId"));
    assertTrue(ClientSettings.afkSnapshots(settings));
    assertEquals("https://private.example", settings.getProperty("apiUrl"));
  }

  @Test
  void changingOnlyTheLocalFolderPreservesTheAccount() {
    Properties settings = paired();
    assertFalse(
        ClientSettings.configure(
            settings,
            ClientSettings.DEFAULT_API_URL,
            ClientSettings.DEFAULT_API_URL + "/",
            "~/souvenirs",
            temporary));
    assertEquals("private-token", settings.getProperty("deviceToken"));
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
}
