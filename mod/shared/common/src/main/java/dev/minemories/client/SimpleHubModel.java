package dev.minemories.client;

final class SimpleHubModel {
  private static final int CODE_LENGTH = 6;

  private SimpleHubModel() {}

  record Input(
      boolean paired,
      boolean inWorld,
      boolean busy,
      boolean autoPhotos,
      int codeLength,
      boolean officialApi) {}

  record Actions(
      boolean connectEnabled,
      boolean captureEnabled,
      boolean autoEnabled,
      boolean memoriesEnabled,
      boolean showCodeField,
      boolean showCodeHelp) {}

  static Actions actions(Input in) {
    int length = Math.clamp(in.codeLength(), 0, CODE_LENGTH);
    return new Actions(
        !in.paired() && !in.busy() && length == CODE_LENGTH,
        in.inWorld() && !in.busy(),
        !in.busy(),
        true,
        !in.paired(),
        !in.paired() && in.officialApi());
  }

  static String statusTitleKey(Input in) {
    return in.paired() ? "minemories.hub.connected" : "minemories.hub.not_connected";
  }

  static String statusHintKey(Input in) {
    return in.paired() ? "minemories.hub.connected_hint" : "minemories.hub.not_connected_hint";
  }

  static String autoLabelKey(Input in) {
    return in.autoPhotos() ? "minemories.hub.auto_on" : "minemories.hub.auto_off";
  }

  static String footerKey(Input in) {
    if (in.busy()) return "minemories.hub.busy";
    if (!in.inWorld()) return "minemories.hub.need_world";
    if (!in.paired()) return "minemories.hub.take_local_hint";
    return "minemories.hub.ready";
  }

  static boolean validCode(String text) {
    if (text.length() != CODE_LENGTH) return false;
    for (int i = 0; i < text.length(); i++) {
      char c = text.charAt(i);
      if (c < '0' || c > '9') return false;
    }
    return true;
  }
}
