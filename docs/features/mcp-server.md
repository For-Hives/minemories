# MCP server (operator)

The API exposes a [Model Context Protocol](https://modelcontextprotocol.io) endpoint so an agent (Claude Code, Claude Desktop, any MCP client) can read and edit Minemories data.

- **Endpoint:** `POST /mcp` (Streamable HTTP, stateless, JSON responses; built on the official `@modelcontextprotocol/sdk` web-standard transport). No sessions, no SSE stream: `GET`/`DELETE` answer 405.
- **Authentication:** `Authorization: Bearer <API_TOKEN>`, the same token as the mod release upload. The route answers 404 when the token is unset or shorter than 32 characters. The token is operator-level (it is not an account): keep it out of repositories and shared configs.
- **Hardening:** constant-time token check, 10 failed attempts per minute and address then 429, requests carrying an `Origin` header are refused (machine endpoint, DNS rebinding), 256 KiB body limit, never CORS-enabled, `Cache-Control: private, no-store`.

## Tools

| Tool | Effect |
| --- | --- |
| `platform_summary` | Totals: accounts, admins, captures, trash, devices, stored bytes. |
| `list_users`, `get_user` | Accounts (role, captures, storage, devices). Device tokens are never returned. |
| `list_memories`, `get_memory` | Captures and their metadata, live or trashed; inline thumbnails/icons are left out. |
| `rename_memory`, `trash_memory`, `restore_memory` | Edit a capture through the same functions as the account RPC. Trash is reversible (30 days); there is deliberately no hard delete. |
| `set_user_name`, `set_user_minecraft_head`, `set_user_image`, `set_user_email` | Edit an account name, picture (Minecraft head or https URL) or e-mail (+ verified flag; unique). |
| `admin_summary`, `admin_insights`, `admin_list_users`, `admin_role_audit` | The admin page: sign-up/upload series, versions, share statistics, activity, account table with quota, role audit. |
| `set_user_role`, `delete_user` | Promote/demote (the last administrator is protected). Deletion is irreversible, refuses administrators and needs `confirm` equal to the account id; objects go through the durable deletion queue. |
| `list_role_storage`, `set_role_storage` | Storage limit per role (`user`, `admin`): configured limit, what holders get, holder count. `set_role_storage` takes `{ role, quotaBytes }` in decimal bytes (at most 1e12) or `null` to remove a limit; the change is recorded with `updated_by = operator:mcp`. See [limits by role](account-storage-quota.md#limits-by-role). |
| `revoke_device` | Unpairs a device immediately. |
| `list_share_links`, `revoke_share_link` | Share links (never the link secret) and their revocation. |
| `list_diagnostics`, `get_diagnostic`, `set_diagnostic_state` | Sanitized diagnostic issues and triage (open, in_progress, resolved, ignored). |
| `moderation_summary`, `moderation_queue`, `moderate_publication`, `unpublish_memory` | Public-gallery review queue, approve/reject, take a capture out of the gallery. |

The admin tools call the same services as the admin page (`mcp-admin.ts`), acting as the reserved identity `OPERATOR_ACTOR` (`operator:mcp`, which no Better Auth session can carry), so role rules, the last-administrator guard and moderation logic stay identical. There is deliberately no raw SQL tool and no hard delete of captures: the database also holds sessions and password hashes.

## Connect a client

```bash
claude mcp add --transport http minemories https://api.minemories.net/mcp \
  --header "Authorization: Bearer $API_TOKEN"
```

Local development: `http://localhost:3001/mcp` with the `API_TOKEN` from the root `.env`.

## Related: head on first pairing

When the mod pairs, it sends the in-game username (`minecraftUsername`, validated `^\w{3,16}$`). The API sets the account picture to that player's head only if the account has none; an existing picture is never replaced.
