package dev.minemories.core;

import java.util.regex.Pattern;

/**
 * Non-personal scene description shared by both writers. Only a closed set of technical fields is
 * ever written: no player, world, server, path, sign or book data, and no absolute coordinates.
 */
public final class GlbMetadata {
  /** 3: material and light colours are linear, as glTF 2.0 requires (2 wrote them in sRGB). */
  public static final int FORMAT = 3;

  private static final Pattern VERSION = Pattern.compile("[A-Za-z0-9_.+\\-]{1,64}");
  private static final Pattern RESOURCE =
      Pattern.compile("[a-z0-9_.\\-]{1,32}:[a-z0-9_./\\-]{1,64}");

  private String minecraft = "", loader = "", mod = "", dimension = "";

  /** Values that are empty or contain anything beyond a plain identifier are ignored. */
  public void setSource(String minecraft, String loader, String mod, String dimension) {
    this.minecraft = safe(VERSION, minecraft);
    this.loader = safe(VERSION, loader);
    this.mod = safe(VERSION, mod);
    this.dimension = safe(RESOURCE, dimension);
  }

  private static String safe(Pattern pattern, String value) {
    return value != null && !value.contains("..") && pattern.matcher(value).matches() ? value : "";
  }

  /** The {@code asset} object, with the Minemories description in {@code extras}. */
  String assetJson(int[] quadsByCategory) {
    StringBuilder text =
        new StringBuilder("{\"version\":\"2.0\",\"generator\":\"Minemories\",\"extras\":{")
            .append("\"minemories\":{\"format\":")
            .append(FORMAT);
    field(text, "minecraft", minecraft);
    field(text, "loader", loader);
    field(text, "mod", mod);
    field(text, "dimension", dimension);
    text.append(",\"chunkSize\":16,\"categories\":{");
    boolean first = true;
    for (GlbCategory category : GlbCategory.values()) {
      int quads = quadsByCategory[category.ordinal()];
      if (quads == 0) continue;
      if (!first) text.append(',');
      first = false;
      text.append('"').append(category.id()).append("\":{\"quads\":").append(quads).append('}');
    }
    return text.append("}}}}").toString();
  }

  private static void field(StringBuilder text, String name, String value) {
    if (!value.isEmpty()) text.append(",\"").append(name).append("\":\"").append(value).append('"');
  }
}
