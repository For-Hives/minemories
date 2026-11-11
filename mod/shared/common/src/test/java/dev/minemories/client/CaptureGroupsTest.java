package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class CaptureGroupsTest {
  private static CaptureHistory.Entry entry(
      String id, String world, boolean server, String worldId, boolean readable) {
    return new CaptureHistory.Entry(
        id, Path.of(id, "capture.glb"), Instant.EPOCH, 10, world, readable, false, server, worldId);
  }

  @Test
  void groupsByWorldOrServerNewestGroupFirstAndIdentityLessLast() {
    var groups =
        CaptureGroups.group(
            List.of(
                entry("1", "", false, "", true),
                entry("2", "Survival", false, "h1", true),
                entry("3", "play.example.com", true, "h2", true),
                entry("4", "Survival", false, "h3", true),
                entry("5", "", false, "h9", true),
                entry("6", "Survival", false, "", false),
                entry("7", "Survival", true, "", true)));
    assertEquals(
        List.of("world:Survival", "server:play.example.com", "id:h9", "server:Survival", ""),
        groups.stream().map(CaptureGroups.Group::key).toList());
    assertEquals(
        List.of("2", "4"),
        groups.getFirst().entries().stream().map(CaptureHistory.Entry::id).toList());
    assertTrue(groups.get(1).server());
    assertTrue(groups.get(2).unknown());
    var unknown = groups.getLast();
    assertTrue(unknown.unknown());
    assertEquals(
        List.of("1", "6"), unknown.entries().stream().map(CaptureHistory.Entry::id).toList());
    assertTrue(CaptureGroups.group(List.of()).isEmpty());
  }

  @Test
  void pagesNeverEndOnAHeaderAndRepeatTheHeaderOfASplitGroup() {
    List<CaptureHistory.Entry> all = new ArrayList<>();
    for (int i = 0; i < 4; i++) all.add(entry("a" + i, "A", false, "", true));
    all.add(entry("b0", "B", false, "", true));
    var pages = CaptureGroups.pages(CaptureGroups.group(all), 4);
    assertEquals(2, pages.size());
    assertEquals(List.of("A", "a0", "a1", "a2"), describe(pages.get(0)));
    assertEquals(List.of("A", "a3", "B", "b0"), describe(pages.get(1)));
    for (var page : pages) assertFalse(page.getLast().header());
  }

  @Test
  void aHeaderThatWouldBeLastMovesToTheNextPage() {
    List<CaptureHistory.Entry> all =
        List.of(
            entry("a0", "A", false, "", true),
            entry("a1", "A", false, "", true),
            entry("b0", "B", false, "", true));
    var pages = CaptureGroups.pages(CaptureGroups.group(all), 3);
    assertEquals(List.of("A", "a0", "a1"), describe(pages.get(0)));
    assertEquals(List.of("B", "b0"), describe(pages.get(1)));
    assertTrue(CaptureGroups.pages(List.of(), 3).isEmpty());
    assertThrows(IllegalArgumentException.class, () -> CaptureGroups.pages(List.of(), 1));
  }

  private static List<String> describe(List<CaptureGroups.Line> page) {
    return page.stream()
        .map(line -> line.header() ? line.group().label() : line.entry().id())
        .toList();
  }
}
