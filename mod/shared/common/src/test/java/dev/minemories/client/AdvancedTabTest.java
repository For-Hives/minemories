package dev.minemories.client;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashSet;
import org.junit.jupiter.api.Test;

class AdvancedTabTest {
  @Test
  void everyTabHasADistinctLabelKey() {
    var keys = new HashSet<String>();
    for (AdvancedTab tab : AdvancedTab.values()) {
      assertTrue(tab.labelKey().startsWith("minemories.advanced.tab."));
      assertTrue(keys.add(tab.labelKey()));
    }
  }

  @Test
  void anOutOfRangeIndexFallsBackToTheFirstTab() {
    assertEquals(AdvancedTab.ACCOUNT, AdvancedTab.at(-1));
    assertEquals(AdvancedTab.ACCOUNT, AdvancedTab.at(99));
    assertEquals(AdvancedTab.WORLD, AdvancedTab.at(2));
  }
}
