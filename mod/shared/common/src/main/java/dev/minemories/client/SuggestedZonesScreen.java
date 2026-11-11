package dev.minemories.client;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.resources.language.I18n;
import net.minecraft.network.chat.Component;

/**
 * A top-down heatmap of where the player spent time, 64 by 64 blocks per square, with the best
 * places for a memory numbered. Looking at it never selects, captures or sends anything.
 */
final class SuggestedZonesScreen extends Screen {
  private static final int ZONE = 64;
  private static final int CELL = 9;
  private static final int ROWS = 13;
  private static final int PANEL_HEIGHT = 236;
  private static final int MAP_TOP = 46;
  private final Screen parent;
  private final Map<Long, VisitedZones.Zone> zones = new HashMap<>();
  private final Map<Long, Integer> ranks = new HashMap<>();
  private List<ZoneRanking.Suggestion> suggestions = List.of();
  private int centerX;
  private int centerZ;
  private int playerX;
  private int playerZ;
  private int columns;
  private int left;
  private int top;
  private int panelWidth;

  SuggestedZonesScreen(Screen parent) {
    super(Component.translatable("minemories.ui.suggested_areas"));
    this.parent = parent;
  }

  @Override
  protected void init() {
    panelWidth = Math.min(390, width - 12);
    left = (width - panelWidth) / 2;
    top = Math.max(4, (height - PANEL_HEIGHT) / 2);
    columns = (panelWidth - 28) / CELL;
    zones.clear();
    ranks.clear();
    for (VisitedZones.Zone zone : ClientRuntime.visitedZones()) {
      zones.put(key(zone.minX(), zone.minZ()), zone);
    }
    suggestions = ClientRuntime.suggestedZones();
    for (int i = 0; i < suggestions.size(); i++) {
      ranks.put(key(suggestions.get(i).minX(), suggestions.get(i).minZ()), i + 1);
    }
    var player = Minecraft.getInstance().player;
    playerX = player == null ? 0 : Math.floorDiv(player.blockPosition().getX(), ZONE);
    playerZ = player == null ? 0 : Math.floorDiv(player.blockPosition().getZ(), ZONE);
    centerX = playerX;
    centerZ = playerZ;
    addRenderableWidget(
        Button.builder(Component.translatable("minemories.ui.back"), ignored -> onClose())
            .bounds(left + 14, top + PANEL_HEIGHT - 30, panelWidth - 28, 20)
            .build());
  }

  private static long key(int blockX, int blockZ) {
    return ((long) Math.floorDiv(blockX, ZONE) << 32) ^ (Math.floorDiv(blockZ, ZONE) & 0xFFFFFFFFL);
  }

  private int originX() {
    return left + 14 + (panelWidth - 28 - columns * CELL) / 2;
  }

  /** 0 for no time spent, up to 1 for an hour or more. */
  static double heat(long seconds) {
    if (seconds <= 0) return 0;
    return Math.min(1, Math.log1p(seconds / 20.0) / Math.log1p(3600 / 20.0));
  }

  /** Dark teal for a few seconds, through green and yellow, to orange for an hour. */
  static int color(double heat) {
    int red = (int) (40 + 215 * Math.min(1, heat * 1.6));
    int green = (int) (70 + 150 * Math.min(1, heat * 1.2) - 40 * Math.max(0, heat - 0.7) / 0.3);
    int blue = (int) (80 * (1 - heat));
    return 0xFF000000 | red << 16 | green << 8 | blue;
  }

  @Override
  public void render(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.render(graphics, mouseX, mouseY, partialTick);
    graphics.drawString(font, title, left + 14, top + 12, UiTheme.TEXT);
    graphics.drawString(
        font, I18n.get("minemories.ui.heatmap_hint"), left + 14, top + 26, UiTheme.MUTED);
    int ox = originX();
    int oy = top + MAP_TOP;
    graphics.fill(
        ox - 1, oy - 1, ox + columns * CELL + 1, oy + ROWS * CELL + 1, UiTheme.CHART_FRAME);
    int hoverColumn = -1;
    int hoverRow = -1;
    for (int row = 0; row < ROWS; row++) {
      for (int column = 0; column < columns; column++) {
        VisitedZones.Zone zone = zones.get(key(blockX(column), blockZ(row)));
        int x = ox + column * CELL;
        int y = oy + row * CELL;
        graphics.fill(
            x,
            y,
            x + CELL - 1,
            y + CELL - 1,
            zone == null ? UiTheme.CHART_EMPTY : color(heat(zone.seconds())));
        if (mouseX >= x && mouseX < x + CELL && mouseY >= y && mouseY < y + CELL) {
          hoverColumn = column;
          hoverRow = row;
        }
      }
    }
    drawRanks(graphics, ox, oy);
    drawPlayer(graphics, ox, oy);
    if (hoverColumn >= 0)
      outline(graphics, ox + hoverColumn * CELL, oy + hoverRow * CELL, 0xFFFFFF55);
    graphics.drawString(font, "N", ox - 9, oy + 1, UiTheme.MUTED);
    graphics.drawString(
        font, footer(hoverColumn, hoverRow), left + 14, oy + ROWS * CELL + 7, UiTheme.TEXT);
    drawLegend(graphics, left + 14, oy + ROWS * CELL + 20);
  }

  private int blockX(int column) {
    return (centerX - columns / 2 + column) * ZONE;
  }

  private int blockZ(int row) {
    return (centerZ - ROWS / 2 + row) * ZONE;
  }

  private void drawRanks(GuiGraphics graphics, int ox, int oy) {
    for (int i = 0; i < suggestions.size(); i++) {
      var suggestion = suggestions.get(i);
      int column = Math.floorDiv(suggestion.minX(), ZONE) - (centerX - columns / 2);
      int row = Math.floorDiv(suggestion.minZ(), ZONE) - (centerZ - ROWS / 2);
      if (column < 0 || column >= columns || row < 0 || row >= ROWS) continue;
      int x = ox + column * CELL;
      int y = oy + row * CELL;
      outline(graphics, x, y, 0xFFFFFFFF);
      graphics.drawString(font, Integer.toString(i + 1), x + 2, y + 1, 0xFF000000, false);
    }
  }

  private void drawPlayer(GuiGraphics graphics, int ox, int oy) {
    int column = playerX - (centerX - columns / 2);
    int row = playerZ - (centerZ - ROWS / 2);
    int x = ox + column * CELL + CELL / 2 - 1;
    int y = oy + row * CELL + CELL / 2 - 1;
    graphics.fill(x - 1, y - 1, x + 2, y + 2, 0xFF000000);
    graphics.fill(x, y, x + 1, y + 1, 0xFFFF4040);
  }

  private static void outline(GuiGraphics graphics, int x, int y, int color) {
    graphics.fill(x - 1, y - 1, x + CELL, y, color);
    graphics.fill(x - 1, y + CELL - 1, x + CELL, y + CELL, color);
    graphics.fill(x - 1, y, x, y + CELL - 1, color);
    graphics.fill(x + CELL - 1, y, x + CELL, y + CELL - 1, color);
  }

  /** A gradient from "never been here" to "an hour or more", with the white outline explained. */
  private void drawLegend(GuiGraphics graphics, int x, int y) {
    int width = 90;
    for (int i = 0; i < width; i++) {
      graphics.fill(x + i, y, x + i + 1, y + 6, color(i / (double) (width - 1)));
    }
    graphics.drawString(font, "0", x, y + 8, UiTheme.MUTED, false);
    graphics.drawString(font, "1 h+", x + width - font.width("1 h+"), y + 8, UiTheme.MUTED, false);
    graphics.drawString(
        font, I18n.get("minemories.ui.heatmap_legend"), x + width + 12, y - 1, UiTheme.MUTED);
    graphics.drawString(
        font, I18n.get("minemories.ui.heatmap_you"), x + width + 12, y + 9, UiTheme.MUTED);
  }

  private String footer(int column, int row) {
    if (column < 0) {
      return zones.isEmpty()
          ? I18n.get("minemories.ui.play_one_minute_in_area")
          : I18n.get("minemories.ui.heatmap_hover");
    }
    int blockX = blockX(column);
    int blockZ = blockZ(row);
    VisitedZones.Zone zone = zones.get(key(blockX, blockZ));
    String where =
        "X " + blockX + " → " + (blockX + ZONE - 1) + ", Z " + blockZ + " → " + (blockZ + ZONE - 1);
    if (zone == null) return where + " · " + I18n.get("minemories.ui.heatmap_unvisited");
    Integer rank = ranks.get(key(blockX, blockZ));
    String spot = rank == null ? "" : " · " + I18n.get("minemories.ui.heatmap_spot", rank);
    return where + " · " + duration(zone.seconds()) + spot;
  }

  private static String duration(long seconds) {
    return seconds < 60
        ? seconds + " s"
        : SettingSteps.duration((int) Math.min(Integer.MAX_VALUE, seconds / 60));
  }

  @Override
  public void renderBackground(GuiGraphics graphics, int mouseX, int mouseY, float partialTick) {
    super.renderBackground(graphics, mouseX, mouseY, partialTick);
    UiTheme.panel(graphics, left, top, panelWidth, PANEL_HEIGHT);
  }

  @Override
  public void onClose() {
    if (minecraft != null) minecraft.setScreen(parent);
  }
}
