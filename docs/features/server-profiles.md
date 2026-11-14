# Server profiles: name and picture

Each server (or single-player world) in the gallery has a profile on the owner's account: a name and a picture.
They live in the API (`server_profiles`, keyed by user and `serverKey(metadata)` from `@minemories/api-contract`,
the same key the gallery groups by), so they follow the owner to every device.

## Picture: chosen in the viewer only

The owner picks the picture in the viewer ("Server picture" in the toolbar, owner pages only). The panel shows the
view on screen as the gallery's server card (180 × 96 crop) and as a public card (16:10), with the server name.
Nothing can be uploaded: the picture is always a view of the owner's own capture, 400 × 250 JPEG, retried at lower
qualities until it fits the API's 96,000-character limit.

`memories.setCover({ id, image, name? })` then:

- stores it as the capture's `thumbnail` with `thumbnailChosen: true`; the viewer's automatic preview
  (`memories.setThumbnail`) never replaces a chosen picture. A first publication sends this thumbnail;
- stores it as the server's `cover`; the gallery shows it instead of the newest capture's icon or preview, so a
  new capture no longer changes the server's image;
- renames the server when `name` is given (`null` goes back to the game's name).

An existing public publication keeps the image it was reviewed with.

## Name

`memories.renameServer({ key, name })` from the gallery's server sheet or the viewer panel. The gallery shows the
new name at once and brings the previous one back with a message if the account refuses. A name kept in the
browser by older versions (`minemories-stack-names`, `#server`) is sent to the account once, unless the account
already has one, then removed from the browser.

The name titles the owner's share links (`place` in `/api/shared/:token`) and is the default title of a first
publication. Public pages keep the publication's own title.
