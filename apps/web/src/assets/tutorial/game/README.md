# In-game screenshots for the installation guide

| File | Shown on | What it shows |
| --- | --- | --- |
| `guide-minemories-menu` | `/installation`, "Check that it works" step | Minemories menu opened with M: code field, Connect, "Take a memory", "My memories" |
| `guide-pause-menu` | nowhere since 10 November 2026 | Pause menu (Esc) with the Minemories button at the top right. Outdated: the mod moved the button to an icon in Options. To retake on the Options screen. |
| `guide-export-command` | nowhere since 10 November 2026 | Chat with `/minemories export 16` typed, not yet sent. Kept for the Blender guide. |

These are real game screenshots, taken by the Fabric 1.21.11 client test (`mod/1.21.11/fabric/src/gametest/java/dev/minemories/gametest/GuideScreenshotsGameTest.java`), in English, 1280 × 720, GUI scale 2 (the command is cropped to the chat line). Without a file, the page shows nothing in that spot.

## When to retake them

**Whenever one of these changes**, in the same PR:

- the position or label of the Minemories button in Options (`ClientRuntime.addOptionsButton`, `PauseMenuPlacement`);
- the menu opened with M (`SimpleHubScreen`: buttons, labels, layout) or its default key;
- the `/minemories export` syntax.

Also update the page text (`CheckStep` in `apps/web/src/pages/InstallationSteps.tsx`, `GameScreenshot.tsx`) if it describes the position or label.

## How

```bash
bun mod test fabric-mc1.21.11
```

The test writes the PNGs (prefixed with a number) to `mod/1.21.11/fabric/build/run/clientGameTest/screenshots/`. Convert them to WebP with the exact names above:

```bash
shots=mod/1.21.11/fabric/build/run/clientGameTest/screenshots
out=apps/web/src/assets/tutorial/game
for name in guide-pause-menu guide-minemories-menu; do
	cwebp -quiet -q 90 "$(ls -t $shots/*"$name".png | head -1)" -o "$out/$name.webp"
done
# The chat line alone (bottom left), otherwise the command is unreadable on a phone.
cwebp -quiet -q 90 -crop 0 662 460 58 "$(ls -t $shots/*guide-export-command.png | head -1)" -o "$out/guide-export-command.webp"
```

Then check the image on `/installation` (size, readability at 390 px wide). Never replace these screenshots with generated or retouched images.
