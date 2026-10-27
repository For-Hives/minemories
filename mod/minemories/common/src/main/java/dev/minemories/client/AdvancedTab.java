package dev.minemories.client;

/** Tabs of the advanced settings screen, in display order. */
enum AdvancedTab {
  ACCOUNT("minemories.advanced.tab.account"),
  CAPTURES("minemories.advanced.tab.captures"),
  WORLD("minemories.advanced.tab.world"),
  PRIVACY("minemories.advanced.tab.privacy");

  private final String labelKey;

  AdvancedTab(String labelKey) {
    this.labelKey = labelKey;
  }

  String labelKey() {
    return labelKey;
  }

  /** The tab at {@code index}, or the first one when the index is out of range. */
  static AdvancedTab at(int index) {
    AdvancedTab[] tabs = values();
    return index >= 0 && index < tabs.length ? tabs[index] : tabs[0];
  }
}
