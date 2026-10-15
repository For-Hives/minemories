package dev.minemories.client;

import java.util.Objects;

final class ClientPlatforms {
  private static ClientPlatform platform;

  private ClientPlatforms() {}

  static void install(ClientPlatform value) {
    if (platform != null && platform != value)
      throw new IllegalStateException("Minemories client platform already initialized");
    platform = Objects.requireNonNull(value);
  }

  static ClientPlatform current() {
    return Objects.requireNonNull(platform, "Minemories client platform not initialized");
  }
}
