# Local capture history

In the **M** menu, **Local captures** lists the memories saved on this computer, newest first inside each group. Dates use the computer's time zone.

## Groups

Memories are grouped under a header naming the world or server they were taken in (`worldName`, else `serverName`, from the memory's `capture.json`), with the number of memories in the group. Groups are ordered by their newest memory. A memory with no name but a private `worldId` gets its own group, and memories with neither (made before names were recorded, or with unreadable metadata) are listed last under **Unknown world or server**. A world and a server that share a name stay separate groups. The `worldId` itself differs per dimension and player, so it is not used to split a world into several groups. A group that spans two pages repeats its header on the next page, and a header is never the last line of a page.

## Sending

Each memory that is not in the gallery yet has a small **Send** button at the end of its row; uploaded memories show a green check mark and "Sent" instead, and unreadable ones show "Unreadable" (they cannot be sent until the JSON is repaired). Under the list, the arrows (newer/older, with the page number between them) sit above the bottom row, which holds **Send all (N)** and **Back**.

Sending only uses the file attached to the chosen memory: it does not recapture the open world, and the date, coordinates and dimension come from its JSON. Buttons are disabled without pairing or while another upload (for example an AFK one) is running. A network failure keeps the local file and its resume state.

**Send all** uploads every readable memory without the sent mark, one at a time, newest first, with the message "Sending memory X of N…". A single **Send** is a run of one. Pressing a button while a run is active does nothing, so it cannot start twice. The run ends with "Done: N sent", or "X sent, Y failed" (failed memories keep their button; pressing **Send all** again retries only them). It stops, and says how many are left, when every following upload would fail the same way:

- the API answers **429**: the mod does not retry that request, reads `Retry-After` (seconds, bounded to 1 s – 1 h, 60 s when absent or given as a date) and shows when to try again;
- the gallery is full (413 `storage_quota_exceeded`);
- the device token is refused (401/403).

Leaving the screen stops the run after the upload in flight, which finishes normally and is still marked as sent. The logic lives in plain classes (`CaptureGroups`, `CaptureListView`, `UploadBatch`, `UploadFailure`) with unit tests.

## Where "sent" is recorded

After a successful upload the mod writes an tiny marker file `capture.glb.uploaded` next to the memory (`history/<id>/`). It is local, one tiny file per memory, removed with the memory's folder, and read when the list loads: drawing the list never calls the network, and nothing is recorded or sent before pairing. The marker says the upload succeeded at some point, not that the gallery still holds it (accounts change and remote copies can be deleted); delete the marker file to make a memory sendable again. The mod's own `/minemories upload` and AFK uploads write the same marker.

## Kept files

The default folder is still `~/export`. Every manual, selection or AFK export creates a folder such as `history/capture-20261012T123456123Z-<identifier>/`, containing `capture.glb` and `capture.json`. The date in the name is in UTC; the identifier avoids collisions between captures taken at the same instant. The GLB always embeds its textures and materials.

`~/export/capture.glb` and `capture.json` remain copies of the latest export so the memory can be opened quickly in the viewer. The mod uses the `.minemories-latest` reference to send the file kept in the history, so a new export cannot change the bytes of an upload in progress. When copying manually, keep the GLB and its JSON together to preserve the memory's details.

On the first access to the history, upload of the latest export or new export, the last `capture.glb` from an older version is copied into the history with its JSON and any upload state. This migration does not recover captures that were already overwritten. Without a JSON file, only the file date and known details are used; the mod never assigns them the details of the currently open world. An unreadable JSON file is kept but blocks sending from the interface until it is repaired.

Captures are never deleted automatically. They take up disk space; plan your own backups. To remove a local memory, delete its whole folder after checking that it was uploaded or backed up. Keep the folder pointed to by `.minemories-latest` for commands that send the latest export. Gallery deletions and account changes do not delete the local history. Changing the export folder shows the history of the new folder without moving the old one.

## Integrity and limits

The mod prepares the GLB and JSON in a temporary folder, then publishes that folder once both are complete. An exception during writing leaves the previous export usable. The copies of the latest export and its reference are replaced by renaming; a crash during this phase can leave a new complete memory in the history while the old one is still the latest-export reference. It remains reachable through **Local captures**. Temporary folders left by a hard stop are not shown in the list.

An area with no visible geometry is not published. This can happen before chunks are received or with an empty selection: the M menu explains to wait for the terrain to load or to pick another area. The latest GLB, its JSON and the history remain usable; no upload and no successful AFK interval are recorded for that attempt. Depth tracking ignores positions in chunks that have not arrived yet. Non-empty captures keep their textures, transparency and lights; lights alone are not enough to make a memory.

The check uses the cache of chunks actually received, without loading or generating terrain: `ClientLevel.hasChunkAt` always returns true and is not a reception check. A capture containing only water stays valid, even if it holds no solid block model. Normals are computed in double precision before serialization to keep finite values, including with extreme finite coordinates.

The list is read in the background in one pass over at most the 300 newest memories (older ones stay on disk but are not listed), six lines per page. Each memory's JSON is read with a 2 MiB limit to find its world or server name. Symbolic links in the history and references pointing outside the folder are not followed. A response that arrives after the screen is closed or refreshed does not replace the current page.

This local retention prepares regular snapshots and the timelapse; it does not yet provide an additional scheduler, deduplication between captures or animated playback. Timeline playback and deduplication are still tracked in [issue #75](https://github.com/For-Hives/minemories/issues/75); progressive capture in [issue #84](https://github.com/For-Hives/minemories/issues/84).

## Checking that empty captures are refused

Core tests refuse empty scenes or scenes made only of lights before touching the file, and check the normals of the binary buffer directly for extreme coordinates. A history test keeps the previous model, its JSON and its reference after such a refusal.

The Minecraft 1.21.1 / NeoForge 21.1.248 scenario of 13 October 2026 uses an isolated copy of the world and a local HTTP API. The **Capture and send** button in a missing chunk and **Export selection** in an air-only area keep the old GLB/JSON bytes exactly, with no new history folder or reference. No upload is started and the missing chunk does not enter the depth history. The messages of both modes were inspected on screen. A water-only selection with BLEND geometry, then a capture of loaded terrain, are exported successfully and kept alongside the old memory. This validation does not prove a production upload.

Both GLBs were also imported and rendered in Blender 5.2.2: one mesh with 22 triangles for the water, then one mesh with 394 triangles for the terrain. The images were inspected: water transparency and texture, vegetation, terrain textures and cut faces are present.

Sending again a memory whose upload already succeeded (after deleting its marker, or from the command line) can create another gallery entry.

The identities of future states and the current limits are detailed in
[Timelapse: foundations and remaining work](timelapse.md).
