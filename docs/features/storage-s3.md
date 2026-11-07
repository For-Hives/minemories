# S3 storage — 11 October 2026 migration

The API uses `@aws-sdk/client-s3` and `@aws-sdk/lib-storage` pinned to
`3.1149.0`. Replacing the MinIO client removes the four transitive advisories
from the first audit; `bun audit` returns an empty report with the tested lockfile.
CI also runs this audit. This result describes that lockfile on that date.

## Configuration and compatibility

The `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY` and
`S3_SECRET_KEY` variables are unchanged, as are object keys and the SQLite database.
No object copy or SQL migration is needed. Filesystem mode does not
change. This SDK migration does not migrate old MinIO volumes.

The client uses the configured endpoint, path-style URLs and explicit
credentials; it does not look up credentials from an AWS metadata
service. The bucket is checked once; a 404 allows it to be created, while an
access denial or outage is propagated and allows a later retry.
Creation passes the configured region, except `us-east-1`, where the S3 protocol
expects an empty body. Garage-specific region names remain usable.

Garage 2.4.1 is exercised in real integration. Other S3-compatible
providers are not declared validated by these tests. The real deployment, its HTTPS
endpoint, its bucket permissions and its volumes still need to be checked separately.

## Upload, download and cleanup

The file → S3 transfer uses a stream, **8 MiB** parts and a single
worker. It does not load the whole capture into memory. Chunks from the mod to
the API stay at **4 MiB**, for a maximum file size of **450 MiB**. HTTP downloads
remain private streams, or explicitly shared ones, with `private, no-store`.

The SDK is limited to three attempts, a fifteen-second connection timeout
and a thirty-second socket idle timeout. A failed upload
leaves its parts for the durable SQLite cleanup, which also covers a process
crash. The abort happens before the temporary object is deleted.
The listing is paginated with both markers; only uploads for the exact key
are aborted, leaving keys that share its prefix untouched. Cyclic pagination,
a missing ID or a refused abort keeps the job for a retry.

Optional S3 checksums are set to `WHEN_REQUIRED`: Garage does not
support every CRC extension of the SDK. SHA-256 request signatures
and the resumable protocol's SHA-256 checks are still enforced.
Multipart options are described in the
[official Upload README](https://github.com/aws/aws-sdk-js-v3/blob/main/lib/lib-storage/README.md),
and checksum behavior in the
[AWS documentation](https://docs.aws.amazon.com/sdkref/latest/guide/feature-dataintegrity.html).

## Verification

- HTTP fixtures use the real SDK: byte round trip, regions, permissions,
  initialization failure, signed parts, a rejected part and paginated cleanup.
- A 20 MiB file with distinct data produces 8/8/4 MiB parts,
  with the SHA-256 of the whole compared. Another source keeps its end
  unavailable until the first part is received, to check that upload is streamed.
- `bun run api:garage` passes the eight scenarios against real Garage, including
  outages, cleanup and resuming in a new API process without duplicates.
- `bun run build` keeps the coverage thresholds and builds the web app and the mod.

The GLB format and the Minecraft code do not change. In-game validation of the distributed JAR
and production network trials are still tracked in [issue #81](https://github.com/For-Hives/minemories/issues/81) and [issue #83](https://github.com/For-Hives/minemories/issues/83).
