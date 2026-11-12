package dev.minemories.client;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Splits local captures by the world or server they were taken in, and lays them out in pages. */
final class CaptureGroups {
  private CaptureGroups() {}

  /**
   * Captures of one world or server. An empty {@code label} is the group of captures that carry no
   * identity (made before names were recorded, or unreadable).
   */
  record Group(String key, String label, boolean server, List<CaptureHistory.Entry> entries) {
    Group {
      entries = List.copyOf(entries);
    }

    boolean unknown() {
      return label.isEmpty();
    }
  }

  /** One display line: a group header ({@code entry == null}) or a capture. */
  record Line(Group group, CaptureHistory.Entry entry) {
    boolean header() {
      return entry == null;
    }
  }

  static String key(CaptureHistory.Entry entry) {
    if (!entry.readable()) return "";
    if (!entry.world().isEmpty()) return (entry.server() ? "server:" : "world:") + entry.world();
    return entry.worldId().isEmpty() ? "" : "id:" + entry.worldId();
  }

  /**
   * Groups newest-first captures. Groups are ordered by their newest capture, the identity-less
   * group comes last, and each group keeps its captures newest first.
   */
  static List<Group> group(List<CaptureHistory.Entry> newestFirst) {
    Map<String, List<CaptureHistory.Entry>> byKey = new LinkedHashMap<>();
    for (CaptureHistory.Entry entry : newestFirst) {
      byKey.computeIfAbsent(key(entry), ignored -> new ArrayList<>()).add(entry);
    }
    List<Group> groups = new ArrayList<>();
    for (var bucket : byKey.entrySet()) {
      if (bucket.getKey().isEmpty()) continue;
      CaptureHistory.Entry first = bucket.getValue().get(0);
      groups.add(new Group(bucket.getKey(), first.world(), first.server(), bucket.getValue()));
    }
    List<CaptureHistory.Entry> unknown = byKey.get("");
    if (unknown != null) groups.add(new Group("", "", false, unknown));
    return groups;
  }

  /**
   * Pages of at most {@code lines} lines. A header is never the last line of a page, and a group
   * split across pages repeats its header on the next one.
   */
  static List<List<Line>> pages(List<Group> groups, int lines) {
    if (lines < 2) throw new IllegalArgumentException("A page needs room for a header and a row.");
    List<List<Line>> pages = new ArrayList<>();
    List<Line> page = new ArrayList<>();
    for (Group group : groups) {
      boolean header = false;
      for (CaptureHistory.Entry entry : group.entries()) {
        int needed = header ? 1 : 2;
        if (page.size() + needed > lines) {
          pages.add(page);
          page = new ArrayList<>();
          header = false;
        }
        if (!header) {
          page.add(new Line(group, null));
          header = true;
        }
        page.add(new Line(group, entry));
      }
    }
    if (!page.isEmpty()) pages.add(page);
    return pages;
  }
}
