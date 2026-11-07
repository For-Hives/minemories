# Local capture history

In the **M** menu, **Local captures** lists the memories saved on this computer, newest first. Dates use the computer's time zone. Each row shows the world or server and the file size. The arrows page through the history; **Refresh** rereads the folder configured in advanced mode.

Selecting a row and then **Send this capture** sends only that memory to the private gallery of the currently signed-in account. The button stays disabled without pairing or while another upload is running. This action does not recapture the open world. The date, coordinates, dimension and other details come from the file attached to the chosen memory. A network failure keeps the local file and its resume state; a new capture does not overwrite the data of an upload in progress.

## Kept files

The default folder is still `~/export`. Every manual, selection or AFK export creates a folder such as `history/capture-20261012T123456123Z-<identifier>/`, containing `capture.glb` and `capture.json`. The date in the name is in UTC; the identifier avoids collisions between captures taken at the same instant. The GLB always embeds its textures and materials.

`~/export/capture.glb` and `capture.json` remain copies of the latest export so the memory can be opened quickly in the viewer. The mod uses the `.minemories-latest` reference to send the file kept in the history, so a new export cannot change the bytes of an upload in progress. When copying manually, keep the GLB and its JSON together to preserve the memory's details.

On the first access to the history, upload of the latest export or new export, the last `capture.glb` from an older version is copied into the history with its JSON and any upload state. This migration does not recover captures that were already overwritten. Without a JSON file, only the file date and known details are used; the mod never assigns them the details of the currently open world. An unreadable JSON file is kept but blocks sending from the interface until it is repaired.

Captures are never deleted automatically. They take up disk space; plan your own backups. To remove a local memory, delete its whole folder after checking that it was uploaded or backed up. Keep the folder pointed to by `.minemories-latest` for commands that send the latest export. Gallery deletions and account changes do not delete the local history. Changing the export folder shows the history of the new folder without moving the old one.

## Integrity and limits

The mod prepares the GLB and JSON in a temporary folder, then publishes that folder once both are complete. An exception during writing leaves the previous export usable. The copies of the latest export and its reference are replaced by renaming; a crash during this phase can leave a new complete memory in the history while the old one is still the latest-export reference. It remains reachable through **Local captures**. Temporary folders left by a hard stop are not shown in the list.

An area with no visible geometry is not published. This can happen before chunks are received or with an empty selection: the M menu explains to wait for the terrain to load or to pick another area. The latest GLB, its JSON and the history remain usable; no upload and no successful AFK interval are recorded for that attempt. Depth tracking ignores positions in chunks that have not arrived yet. Non-empty captures keep their textures, transparency and lights; lights alone are not enough to make a memory.

The check uses the cache of chunks actually received, without loading or generating terrain: `ClientLevel.hasChunkAt` always returns true and is not a reception check. A capture containing only water stays valid, even if it holds no solid block model. Normals are computed in double precision before serialization to keep finite values, including with extreme finite coordinates.

The list is read in the background, with four memories per page and bounded memory while sorting. JSON files are read only for memories that are displayed or sent, with a 2 MiB limit. Symbolic links in the history and references pointing outside the folder are not followed. A response that arrives after the screen is closed or refreshed does not replace the current page.

This local retention prepares regular snapshots and the timelapse; it does not yet provide an additional scheduler, deduplication between captures or animated playback. Timeline playback and deduplication are still tracked in [issue #75](https://github.com/For-Hives/minemories/issues/75); progressive capture in [issue #84](https://github.com/For-Hives/minemories/issues/84).

## Checking that empty captures are refused

Core tests refuse empty scenes or scenes made only of lights before touching the file, and check the normals of the binary buffer directly for extreme coordinates. A history test keeps the previous model, its JSON and its reference after such a refusal.

The Minecraft 1.21.1 / NeoForge 21.1.248 scenario of 13 October 2026 uses an isolated copy of the world and a local HTTP API. The **Capture and send** button in a missing chunk and **Export selection** in an air-only area keep the old GLB/JSON bytes exactly, with no new history folder or reference. No upload is started and the missing chunk does not enter the depth history. The messages of both modes were inspected on screen. A water-only selection with BLEND geometry, then a capture of loaded terrain, are exported successfully and kept alongside the old memory. This validation does not prove a production upload.

Both GLBs were also imported and rendered in Blender 5.2.2: one mesh with 22 triangles for the water, then one mesh with 394 triangles for the terrain. The images were inspected: water transparency and texture, vegetation, terrain textures and cut faces are present.

Sending again a memory whose upload already succeeded can create another gallery entry. The interface shows no "already sent" status: accounts and APIs can change and the remote copy may have been deleted.

The identities of future states and the current limits are detailed in
[Timelapse: foundations and remaining work](timelapse.md).
