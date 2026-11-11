# Gallery previews

Cards in the private gallery show a picture picked by pure functions in `apps/web/src/lib/gallery.ts`.

- **Stack of snapshots** (`stackPreview`): the `thumbnail` (3D preview) of the most recent capture that has one. The
  newest capture often has none yet (the preview is set after upload), so the card no longer falls back to a
  placeholder or to the server icon while older snapshots have a preview.
- **World card** (`worldCover`): the server `icon` of the most recent capture that has one; otherwise the latest 3D
  preview among all its captures; otherwise the placeholder.
- Recency is the capture time (`capturedAt`, falling back to the upload time), the newest upload winning ties.

Rendering: pictures are `<img loading="lazy" decoding="async">` inside boxes with a fixed size or aspect ratio, so
nothing shifts while loading. 3D previews fill the box (`object-fit: cover`, smooth); a server icon keeps its square
shape, centred and rendered with `image-rendering: pixelated` so a small pixel-art icon is neither blurred nor
stretched. Images are the data URLs already inside the private `memories.list` response: no new URL and no caching
change.

Validation: `lib/gallery.test.ts` (selection), `pages/gallery-lifecycle.test.tsx` (card interaction), and a browser
check against a seeded local API (world with icon, world without, stack whose newest snapshot has no preview).
