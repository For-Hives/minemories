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
| `set_user_name`, `set_user_minecraft_head` | Edit an account name or picture (head built server-side from a validated username). |

## Connect a client

```bash
claude mcp add --transport http minemories https://api.minemories.net/mcp \
  --header "Authorization: Bearer $API_TOKEN"
```

Local development: `http://localhost:3001/mcp` with the `API_TOKEN` from the root `.env`.

## Related: head on first pairing

When the mod pairs, it sends the in-game username (`minecraftUsername`, validated `^\w{3,16}$`). The API sets the account picture to that player's head only if the account has none; an existing picture is never replaced.
