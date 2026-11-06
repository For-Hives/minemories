package dev.minemories.client;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Client-thread connection identity; settings are read once per connection or explicit settings
 * change.
 */
final class RemoteCaptureSession {
  record Binding(String namespace, boolean configured) {}

  record Exploration(ExplorationDepth depth, VisitedZones zones) {}

  private final LinkedHashMap<Path, Exploration> exploration = new LinkedHashMap<>(8, 0.75f, true);
  private Object connection;
  private String namespace;
  private String server;
  private Binding binding;

  String namespace(Object current) {
    Objects.requireNonNull(current);
    if (connection != current) {
      connection = current;
      namespace = UUID.randomUUID().toString();
      binding = null;
      exploration.clear();
    }
    return namespace;
  }

  Binding binding(Object current, String endpoint, Supplier<String> configured) {
    String session = namespace(current);
    if (!Objects.equals(server, endpoint)) {
      server = endpoint;
      binding = null;
    }
    if (binding == null) {
      String value = configured.get();
      binding = value.isEmpty() ? new Binding(session, false) : new Binding(value, true);
    }
    return binding;
  }

  Exploration exploration(Path path) {
    Exploration known = exploration.get(path);
    if (known != null) return known;
    if (exploration.size() >= 8) exploration.remove(exploration.keySet().iterator().next());
    var created = new Exploration(new ExplorationDepth(), new VisitedZones());
    exploration.put(path, created);
    return created;
  }

  Object connection() {
    return connection;
  }

  void settingsChanged() {
    binding = null;
  }

  void clear() {
    connection = null;
    namespace = null;
    server = null;
    binding = null;
    exploration.clear();
  }
}
