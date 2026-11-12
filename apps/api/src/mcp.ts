import type { Database } from 'bun:sqlite'
import { minecraftHeadUrl, minecraftUsername } from '@minemories/api-contract'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { Hono } from 'hono'
import * as z from 'zod'
import { FailureLimiter, MIN_TOKEN_LENGTH, tokenMatches } from './mod-upload'
import { pairingAddress } from './pairing-protection'
import { logApiFailure } from './safe-errors'
import { ACCOUNT_USAGE_SQL } from './storage-quota'

const bearerPrefix = 'Bearer '
const noStore = { 'Cache-Control': 'private, no-store' }
const MAX_LIST = 100
const MCP_BODY_BYTES = 256 * 1024

type Env = Record<string, string | undefined>
type Variables = { correlationId: string }
type Bindings = { peerAddress: string | undefined }

/** Memory operations the tools delegate to (the same functions the account RPC uses, scoped to the memory's owner). */
export interface McpMemoryOperations {
	rename(userId: string, id: string, name: string): boolean
	trash(userId: string, id: string): boolean
	restore(userId: string, id: string): boolean
}

export interface McpOptions {
	database: Database
	memories: McpMemoryOperations
	env?: () => Env
	now?: () => number
}

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })
const failure = (message: string) => ({ isError: true, content: [{ type: 'text' as const, text: message }] })
const wildcard = /[\\%_]/g
const limit = z.number().int().min(1).max(MAX_LIST).default(25)
const offset = z.number().int().min(0).default(0)

interface MemoryRow {
	id: string
	user_id: string
	name: string
	size: number
	created_at: number
	deleted_at: number | null
	metadata_json: string | null
}

const memoryView = (row: MemoryRow) => ({
	id: row.id,
	ownerId: row.user_id,
	name: row.name,
	size: row.size,
	createdAt: new Date(row.created_at).toISOString(),
	deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at).toISOString(),
	// The thumbnail and icon are inline images: useless to an agent and heavy, so they stay out of the answer.
	metadata: row.metadata_json ? omitImages(JSON.parse(row.metadata_json)) : null,
})

function omitImages(metadata: Record<string, unknown>) {
	const { thumbnail: _thumbnail, icon: _icon, ...rest } = metadata
	return rest
}

/**
 * Builds one MCP server per request (stateless Streamable HTTP: no session to keep, nothing to leak between callers).
 * Operator tools only: the bearer token is the release token, not an account.
 */
export function createMcpServer({ database, memories, now = Date.now }: Omit<McpOptions, 'env'>) {
	const server = new McpServer(
		{ name: 'minemories', version: '1.0.0' },
		{
			instructions:
				'Operator tools for the Minemories API: read accounts, captures ("memories") and devices, rename or trash captures, ' +
				'and set account names and Minecraft heads. Identifiers are Better Auth user ids and capture UUIDs. ' +
				'Captures are never hard-deleted from here: trash is reversible with restore_memory.',
		}
	)
	const memory = (id: string) => database.query('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow | null
	const userExists = (id: string) => database.query('SELECT 1 FROM user WHERE id = ?').get(id) !== null

	server.registerTool(
		'platform_summary',
		{ title: 'Platform summary', description: 'Totals: accounts, captures, trash, devices, stored bytes.' },
		() => {
			const one = (sql: string) => (database.query(sql).get() as { n: number }).n
			return text({
				users: one('SELECT COUNT(*) AS n FROM user'),
				admins: one('SELECT COUNT(*) AS n FROM user_roles'),
				memories: one('SELECT COUNT(*) AS n FROM memories WHERE deleted_at IS NULL'),
				trashedMemories: one('SELECT COUNT(*) AS n FROM memories WHERE deleted_at IS NOT NULL'),
				devices: one('SELECT COUNT(*) AS n FROM devices WHERE revoked_at IS NULL'),
				storedBytes: one('SELECT COALESCE(SUM(size),0) AS n FROM memories'),
			})
		}
	)

	server.registerTool(
		'list_users',
		{
			title: 'List accounts',
			description: 'Accounts with role, capture count, storage and active devices. `query` matches name, e-mail or id.',
			inputSchema: { query: z.string().max(100).default(''), limit, offset },
		},
		({ query, limit: count, offset: skip }) => {
			const search = `%${query.replace(wildcard, '\\$&')}%`
			const rows = database
				.query(`WITH usage AS (${ACCOUNT_USAGE_SQL})
   SELECT u.id,u.name,u.email,u.image,u.createdAt,
   CASE WHEN EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id) THEN 'admin' ELSE 'user' END AS role,
   COALESCE(g.captures,0) AS captures,COALESCE(g.usedBytes,0) AS usedBytes,
   (SELECT COUNT(*) FROM devices d WHERE d.user_id=u.id AND d.revoked_at IS NULL) AS devices
   FROM user u LEFT JOIN usage g ON g.user_id=u.id
   WHERE u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.id LIKE ? ESCAPE '\\'
   ORDER BY u.createdAt DESC,u.id LIMIT ? OFFSET ?`)
				.all(search, search, search, count, skip)
			return text(rows)
		}
	)

	server.registerTool(
		'get_user',
		{
			title: 'Get account',
			description: 'One account with its paired devices (names and dates; never tokens).',
			inputSchema: { userId: z.string().min(1).max(200) },
		},
		({ userId }) => {
			const user = database
				.query('SELECT id,name,email,emailVerified,image,createdAt,updatedAt FROM user WHERE id = ?')
				.get(userId)
			if (!user) return failure('User not found.')
			const devices = database
				.query('SELECT id,name,created_at,revoked_at FROM devices WHERE user_id = ? ORDER BY created_at DESC')
				.all(userId)
			const admin = database.query('SELECT 1 FROM user_roles WHERE user_id = ?').get(userId) !== null
			return text({ ...user, role: admin ? 'admin' : 'user', devices })
		}
	)

	server.registerTool(
		'list_memories',
		{
			title: 'List captures',
			description: 'Captures, newest first. Filter by owner; `trashed` selects the trash instead of live captures.',
			inputSchema: {
				userId: z.string().min(1).max(200).optional(),
				trashed: z.boolean().default(false),
				limit,
				offset,
			},
		},
		({ userId, trashed, limit: count, offset: skip }) => {
			const rows = database
				.query(
					`SELECT * FROM memories WHERE (? IS NULL OR user_id = ?) AND (deleted_at IS NOT NULL) = ?
					 ORDER BY created_at DESC LIMIT ? OFFSET ?`
				)
				.all(userId ?? null, userId ?? null, trashed ? 1 : 0, count, skip) as MemoryRow[]
			return text(rows.map(memoryView))
		}
	)

	server.registerTool(
		'get_memory',
		{
			title: 'Get capture',
			description: 'One capture with its full metadata (world, coordinates, dimension, timestamps).',
			inputSchema: { id: z.uuid() },
		},
		({ id }) => {
			const row = memory(id)
			return row ? text(memoryView(row)) : failure('Memory not found.')
		}
	)

	const edit = (id: string, change: (userId: string) => boolean, done: string) => {
		const row = memory(id)
		if (!row) return failure('Memory not found.')
		return change(row.user_id)
			? text({ ok: true, id, result: done })
			: failure(`Nothing changed: the capture is not in the expected state.`)
	}

	server.registerTool(
		'rename_memory',
		{
			title: 'Rename capture',
			description: 'Renames a live capture.',
			inputSchema: { id: z.uuid(), name: z.string().trim().min(1).max(80) },
		},
		({ id, name }) => edit(id, userId => memories.rename(userId, id, name), 'renamed')
	)
	server.registerTool(
		'trash_memory',
		{
			title: 'Trash capture',
			description: 'Moves a capture to the trash (kept 30 days, reversible with restore_memory).',
			inputSchema: { id: z.uuid() },
		},
		({ id }) => edit(id, userId => memories.trash(userId, id), 'trashed')
	)
	server.registerTool(
		'restore_memory',
		{
			title: 'Restore capture',
			description: 'Brings a trashed capture back.',
			inputSchema: { id: z.uuid() },
		},
		({ id }) => edit(id, userId => memories.restore(userId, id), 'restored')
	)

	server.registerTool(
		'set_user_name',
		{
			title: 'Set account name',
			description: 'Changes the display name of an account.',
			inputSchema: { userId: z.string().min(1).max(200), name: z.string().trim().min(1).max(80) },
		},
		({ userId, name }) => {
			if (!userExists(userId)) return failure('User not found.')
			database.query('UPDATE user SET name=?,updatedAt=? WHERE id=?').run(name, now(), userId)
			return text({ ok: true, userId, name })
		}
	)

	server.registerTool(
		'set_user_minecraft_head',
		{
			title: 'Set Minecraft head',
			description: 'Uses the head of a Minecraft player as the account image; `null` clears it.',
			inputSchema: { userId: z.string().min(1).max(200), username: minecraftUsername.nullable() },
		},
		({ userId, username }) => {
			if (!userExists(userId)) return failure('User not found.')
			const image = username === null ? null : minecraftHeadUrl(username)
			database.query('UPDATE user SET image=?,updatedAt=? WHERE id=?').run(image, now(), userId)
			return text({ ok: true, userId, image })
		}
	)

	return server
}

/**
 * `POST /mcp`: Model Context Protocol endpoint (Streamable HTTP, stateless, JSON responses).
 * Authenticated with the release token (`API_TOKEN`, 32+ characters; otherwise the route answers 404).
 * Browsers are refused (any `Origin` header): this is a machine endpoint, which also closes DNS-rebinding attacks.
 */
export function createMcpRoute(options: McpOptions) {
	const readEnv = options.env ?? (() => process.env)
	const now = options.now ?? Date.now
	const route = new Hono<{ Bindings: Bindings; Variables: Variables }>()
	const limiter = new FailureLimiter()

	type Refusal = { status: 401 | 403 | 404 | 405 | 413 | 429; error: string; retryAfter?: string }
	function authorize(request: Request, peerAddress: string | undefined, env: Env): Refusal | null {
		const trusted = new Set(
			(env.TRUSTED_PROXY_IPS ?? '')
				.split(',')
				.map(item => item.trim())
				.filter(Boolean)
		)
		const address = pairingAddress(peerAddress, request.headers, trusted)
		if (limiter.blocked(address, now())) return { status: 429, error: 'too_many_attempts', retryAfter: '60' }
		const authorization = request.headers.get('authorization') ?? ''
		const supplied = authorization.startsWith(bearerPrefix) ? authorization.slice(bearerPrefix.length) : ''
		if (supplied && tokenMatches(supplied, env.API_TOKEN ?? '')) return null
		limiter.fail(address, now())
		return { status: 401, error: 'unauthorized' }
	}

	function refuse(request: Request, peerAddress: string | undefined, env: Env): Refusal | null {
		if ((env.API_TOKEN ?? '').length < MIN_TOKEN_LENGTH) return { status: 404, error: 'not_found' }
		if (request.headers.has('origin')) return { status: 403, error: 'forbidden_origin' }
		const denied = authorize(request, peerAddress, env)
		if (denied) return denied
		if (request.method !== 'POST') return { status: 405, error: 'method_not_allowed' }
		if (Number(request.headers.get('content-length') ?? 0) > MCP_BODY_BYTES) return { status: 413, error: 'too_large' }
		return null
	}

	route.all('/', async context => {
		const request = context.req.raw
		const refusal = refuse(request, context.env?.peerAddress, readEnv())
		if (refusal) {
			if (refusal.retryAfter) context.header('Retry-After', refusal.retryAfter)
			return context.json({ error: refusal.error }, refusal.status, noStore)
		}
		const server = createMcpServer({ database: options.database, memories: options.memories, now })
		const transport = new WebStandardStreamableHTTPServerTransport({
			enableJsonResponse: true,
		})
		try {
			await server.connect(transport)
			const response = await transport.handleRequest(request)
			response.headers.set('Cache-Control', 'private, no-store')
			return response
		} catch {
			logApiFailure('mcp_failed', context.get('correlationId'))
			return context.json({ error: 'request_failed' }, 500, noStore)
		} finally {
			await transport.close().catch(() => undefined)
			await server.close().catch(() => undefined)
		}
	})
	return route
}
