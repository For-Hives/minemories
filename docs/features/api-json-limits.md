# JSON request limits

Routes that receive account or capture information have their own cap, applied
before their parser. GLB files keep their usual binary limits.

| Route | Cap on the received body |
| --- | --- |
| Authentication `/api/auth/*` | 16 KiB, i.e. 16,384 bytes |
| RPC `/rpc/*` | 256 KiB, i.e. 262,144 bytes |
| Initialization `POST /api/mod/uploads` | 256 KiB, i.e. 262,144 bytes |
| Pairing `POST /api/mod/pair` | 2 KiB, unchanged |

The check counts the bytes of the stream, even without `Content-Length` or with
a declared value that is too small. A declared size above the cap is refused
immediately. Reading stops and the stream is cancelled as soon as the cap is
exceeded; the refused body is neither passed to the parser nor kept in an
upload's staging area. A cancellation error does not turn the refusal into a
success.

For the three new caps, the response is HTTP 413 with
`{"error":"request_body_too_large"}`. An unreadable stream gets HTTP 400 with
`{"error":"invalid_request_body"}`, without internal details. Malformed JSON
that fits within the size is still handled by the route's parser. Responses
keep the API's CORS rules.

An accepted body keeps the URL, method, cookies, token and origin. The length
header is recomputed and `Transfer-Encoding` removed before handing the body to
the parser. Calls without a body, notably reading the session, still work. The
auth/RPC checks run before their handlers; initialization first requires a
paired device, then checks the size before reserving any file.

## Thumbnails and files

The contract allows 96,000 characters for each of the two images, `thumbnail`
and `icon`. The 256 KiB cap leaves room for both images plus their metadata and
the oRPC envelope. The tests use two real PNGs as data URIs of 95,998 characters
each, with UTF-8 metadata, and check that they are preserved after upload and
after an update through an authenticated session. The test PNG contains a text
chunk with a valid CRC; its decoding was also checked with Pillow.

Legacy uploads remain limited to 100 MiB. Resumable uploads remain limited to
450 MiB, in 4 MiB chunks: the new middleware applies neither to legacy files nor
to chunks. GLB validation and SHA-256 computation of resumable files remain
streamed.

## Validation and scope

The tests cover the exact byte boundary, a UTF-8 character split across two
reads, a missing or false size, stopping the read, stream errors and
preservation of credentials. A real Bun server receives oversized streamed
requests on the three routes and returns 413 with the CORS headers; it then
accepts a GLB file larger than 256 KiB. The initialization tests also check that
no SQLite row or staging file remains after a refusal.

`bun run build`, which includes `bun check`, passes with 72 API tests and 57 web
tests. The middleware has 100% line and function coverage.
`bun run api:garage` passes its seven real HTTP/oRPC and storage scenarios,
including failure and recovery in a new process. The four Garage tests skipped
by the regular API runner are exercised by this dedicated command.

These caps bound the body passed to the parser. They do not replace per-account
storage quotas or proxy protections against slow connections or concurrent
requests, which are tracked separately in [issue #66](https://github.com/For-Hives/minemories/issues/66).
