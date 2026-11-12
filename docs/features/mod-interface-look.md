# The mod interface follows the game's look

The Minemories screens (menu opened with M, advanced settings, memories, automatic captures, memory size, suggested zones) and the button added to Options do not paint their own background or colours. They take the look the game is using: vanilla, a resource pack, or a modpack whose mods restyle Minecraft's buttons and menus. A pack that recolours `widget/button` or `menu_list_background.png` recolours the mod too.

Layout, labels and commands are unchanged: only what was drawn with fixed colours (`graphics.fill(..., 0xFF252926)`, custom-painted button faces) now goes through Minecraft's own textures, sprites and widgets.

## What is drawn by the game, per Minecraft family

| Element | 1.20.2 to 1.21.5 (shared sources, `UiTheme` + `VanillaGui`) | 1.21.6 and later (`overlay/java/.../VanillaGui`) | 1.20.1 | 1.19.2 and 1.18.2 |
| --- | --- | --- | --- | --- |
| Screen background | `Screen.renderBackground` (blur, panorama, menu background), unchanged | same, `extractBackground` on 26.3 | `Screen.renderBackground`, unchanged | same |
| Panel | list background texture (`menu_list_background` or the in-world one), with the header and footer separator textures | same | the options background texture darkened like a vanilla list, with its edge shadow, plus black separators | same |
| Buttons | the real vanilla button: `AbstractButton.renderWidget` draws the face (`widget/button` sprites), its centred label is suppressed and the icon or label is drawn on top | `AbstractButton.renderDefaultSprite` (`extractDefaultSprite` on 26.3), content on top | same as 1.21.1 (`widgets.png` nine-slice) | the button texture `widgets.png`, nine-sliced by `compat.GuiGraphics.buttonFace` (the pre-1.20 renderer cannot draw a face taller than 20 pixels) |
| Tabs | `widget/tab*` sprites and an underline for the selected tab, like the world creation tabs | same | `tab_button.png` nine-slice | no tab widget: the button face, lit for the selected tab |
| Separators | `header_separator` / `footer_separator` textures (in-world variants) | same | black lines | same |
| Text | vanilla white (`0xFFFFFFFF`) for labels, vanilla gray (`0xFFAAAAAA`) for secondary text, `0xFFA0A0A0` when a button is disabled | same | same | same |

Text boxes (`EditBox`), sliders and the plain buttons were already vanilla widgets and stay so.

## Fixed colours that remain, and why

Only colours that carry a meaning. They are in `UiTheme.ACCENTS` and `UiThemeTest` checks every one for a contrast ratio of at least 3:1 (WCAG large text and interface components) against both a dark panel (`#202020`) and a light one (`#E6E6E6`), so they stay readable whether a pack darkens or lightens the panel:

| Accent | Meaning |
| --- | --- |
| `OK` (green) | connected, sent, the automatic captures toggle is on |
| `WARN` (amber) | not connected, storage almost full |
| `ERROR` (red) | failed, unreadable |
| `INFO` (blue) | tells a server apart from a local world in the memories list |

Never rely on colour alone: sent memories also show a check mark and the word, failures show their message.

Not chrome, so not themed: the heat map of the suggested zones screen (its colour ramp, markers and a plain dark frame so the ramp stays readable on any panel), the dark track of the storage bar (translucent black over the panel), the Minemories logo and the gear pixels (white, like vanilla icons).

## Adding a screen or a widget

- Draw the panel with `UiTheme.panel`, text with `UiTheme.TEXT` / `MUTED`, and buttons as vanilla `Button`s or `FaceButton`s. Never `fill` an opaque colour behind content.
- A new colour needs a meaning, an entry in `UiTheme.ACCENTS` and passes `UiThemeTest`.
- `VanillaGui` exists once per Minecraft family. Changing it means porting the change to `mod/1.21.11/overlay`, `mod/26.3/overlay` (their hashes in `shared-sources.properties` are checked by the build), and to the sources embedded in `mod/1.20.1/adapt.gradle` and `mod/shared/compat-legacy/adapt-legacy.gradle`.

## Validation

Throwaway resource packs recoloured the button, tab, list background and separator textures (orange, teal, plum, magenta), and every screen was photographed in game with and without them: Fabric 1.21.11 (title screen and in a world, so both the out-of-world and in-world textures), Fabric 1.20.1 and Fabric 1.19.2 (in a world). A pack recolouring only these textures recoloured every Minemories screen and the Options button; nothing stayed in the old grey-green. The test code and packs were deleted after the run. The same screens were also photographed with the previous code and the same pack to confirm the old fixed grey-green panel and buttons ignored it.

The usual in-game suites (`bun mod test --local`) pass on Fabric 1.21.11 and Forge 1.20.1; every enabled target builds with `bun mod build --all --dev`.

Not validated: a real UI mod or modpack. Mods that replace button rendering through mixins are covered on 1.20.1 and later because the face is drawn by the vanilla widget code itself (`AbstractButton.renderWidget` on 1.20.1 to 1.21.5, `renderDefaultSprite` on 1.21.6 and later), not on 1.19.2 and 1.18.2 where the face is cut from `widgets.png`. The in-game test only exercised Fabric; NeoForge and Forge use the same shared sources and the same `VanillaGui` per Minecraft family. 1.18.2 was built, not run.

A bug found on the way: on 1.20.1 `GuiGraphics.blitNineSliced` divides by zero for a tab whose height is not the texture's 24 pixels when the bottom border is 0 (vanilla only avoids it because its tabs are exactly 24 high), so the 1.20.1 tab uses a 1 pixel bottom border.

The installation guide screenshots (`apps/web/src/assets/tutorial/game/README.md`) were retaken for the new look.
