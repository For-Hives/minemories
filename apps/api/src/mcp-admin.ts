import type { Database } from 'bun:sqlite'
import { roleStorageBytes, storageRole } from '@minemories/api-contract'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { ORPCError } from '@orpc/server'
import * as z from 'zod'
import type { AdminAccounts } from './admin-accounts'
import type { AdminInsightsReader } from './admin-insights'
import type { AdminMetrics } from './admin-metrics'
import { type AdminRoles, OPERATOR_ACTOR } from './admin-roles'
import type { DiagnosticsReview } from './diagnostics-review'
import type { PublicDiscovery } from './discovery'

/** The admin-page services the operator tools drive; every call acts as `OPERATOR_ACTOR`. */
export interface McpAdminServices {
	roles: AdminRoles
	accounts: AdminAccounts
	metrics: AdminMetrics
	insights: AdminInsightsReader
	diagnostics: DiagnosticsReview
	discovery: PublicDiscovery
}

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })
const failure = (message: string) => ({ isError: true, content: [{ type: 'text' as const, text: message }] })
const uniqueViolation = /UNIQUE/i
const httpsUrl = /^https$/
const userId = z.string().min(1).max(200)
const issueState = z.enum(['open', 'in_progress', 'resolved', 'ignored'])

/** Turns an oRPC business error (not found, conflict...) into a tool error the agent can read, rethrows anything else. */
function guarded<T>(run: () => T) {
	try {
		return text(run())
	} catch (error) {
		if (error instanceof ORPCError) return failure(`${error.code}${error.message ? `: ${error.message}` : ''}`)
		throw error
	}
}

/** Storage limits per role (`role-storage.ts`), set as the operator so `updated_by` reads `operator:mcp`. */
function registerRoleStorageTools(tool: McpServer['registerTool'], roles: AdminRoles, now: () => number) {
	const as = OPERATOR_ACTOR
	tool(
		'list_role_storage',
		{
			title: 'Storage by role',
			description:
				'Storage limit of every role (user = every account, admin = administrators) in bytes, whether it is ' +
				'configured, the limit its holders get and how many accounts hold it. An account gets its largest role limit.',
		},
		() => guarded(() => roles.storageRoles(as))
	)
	tool(
		'set_role_storage',
		{
			title: 'Set role storage',
			description:
				'Sets the storage limit of a role in bytes (decimal: 5 GB = 5000000000, at most 1e12), or removes it with ' +
				'`null` (user then returns to ACCOUNT_STORAGE_BYTES). Lowering a limit deletes nothing; it blocks new uploads.',
			inputSchema: { role: storageRole, quotaBytes: roleStorageBytes.nullable() },
		},
		input => guarded(() => roles.setRoleStorage(as, input, now()))
	)
}

/** Everything the administration page shows or changes, plus the matching account and device edits. */
export function registerAdminTools(
	server: McpServer,
	{ database, now, admin }: { database: Database; now: () => number; admin: McpAdminServices }
) {
	const as = OPERATOR_ACTOR
	const tool = server.registerTool.bind(server)

	tool(
		'admin_summary',
		{
			title: 'Admin summary',
			description: 'Sign-up and upload series over the last 24 hours, 7 days or 30 days (the admin overview).',
			inputSchema: { hours: z.union([z.literal(24), z.literal(168), z.literal(720)]).default(168) },
		},
		({ hours }) => guarded(() => admin.metrics.summary(as, hours, now()))
	)
	tool(
		'admin_insights',
		{ title: 'Admin insights', description: 'Versions in use, share-link statistics and account activity levels.' },
		() => guarded(() => admin.insights.read(as, now()))
	)
	tool(
		'admin_list_users',
		{
			title: 'Admin account table',
			description:
				'The admin account table: 25 per page with usage, quota and filters. For a lighter view use list_users.',
			inputSchema: {
				query: z.string().trim().max(100).default(''),
				role: z.enum(['all', 'user', 'admin']).default('all'),
				page: z.number().int().min(1).max(100000).default(1),
				sort: z.enum(['registered_desc', 'registered_asc', 'storage_desc', 'storage_asc']).optional(),
			},
		},
		({ query, role, page, sort }) => guarded(() => admin.roles.users(as, { query, role, page, sort }))
	)
	tool(
		'admin_role_audit',
		{ title: 'Role audit', description: 'The last 50 administrator promotions and demotions.' },
		() => guarded(() => admin.roles.audit(as))
	)
	tool(
		'set_user_role',
		{
			title: 'Set account role',
			description: 'Promotes an account to administrator or demotes it. The last administrator cannot be demoted.',
			inputSchema: { userId, role: z.enum(['user', 'admin']) },
		},
		input => guarded(() => admin.roles.setRole(as, input, now()))
	)
	registerRoleStorageTools(tool, admin.roles, now)
	tool(
		'delete_user',
		{
			title: 'Delete account',
			description:
				'IRREVERSIBLE: deletes a non-administrator account, its devices and captures (stored objects go through the ' +
				'durable deletion queue). Pass `confirm` equal to the account id to proceed.',
			inputSchema: { userId, confirm: z.string() },
		},
		({ userId: id, confirm }) =>
			confirm === id ? guarded(() => admin.accounts.deleteUser(as, id, now())) : failure('confirm must equal userId.')
	)

	tool(
		'set_user_email',
		{
			title: 'Set account e-mail',
			description: 'Changes the e-mail of an account and optionally its verified flag.',
			inputSchema: { userId, email: z.email().max(254), emailVerified: z.boolean().optional() },
		},
		({ userId: id, email, emailVerified }) => {
			try {
				const result = database
					.query('UPDATE user SET email=?,emailVerified=COALESCE(?,emailVerified),updatedAt=? WHERE id=?')
					.run(email.toLowerCase(), emailVerified === undefined ? null : Number(emailVerified), now(), id)
				return result.changes ? text({ ok: true, userId: id, email }) : failure('User not found.')
			} catch (error) {
				if (error instanceof Error && uniqueViolation.test(error.message))
					return failure('Another account uses this e-mail.')
				throw error
			}
		}
	)
	tool(
		'set_user_image',
		{
			title: 'Set account image',
			description:
				'Sets the account image to an https URL, or clears it with `null`. For a Minecraft head use set_user_minecraft_head.',
			inputSchema: {
				userId,
				image: z.url({ protocol: httpsUrl }).max(500).nullable(),
			},
		},
		({ userId: id, image }) =>
			database.query('UPDATE user SET image=?,updatedAt=? WHERE id=?').run(image, now(), id).changes
				? text({ ok: true, userId: id, image })
				: failure('User not found.')
	)

	tool(
		'revoke_device',
		{
			title: 'Revoke device',
			description: 'Unpairs a device: its token stops working immediately.',
			inputSchema: { deviceId: z.string().min(1).max(200) },
		},
		({ deviceId }) =>
			database.query('UPDATE devices SET revoked_at=? WHERE id=? AND revoked_at IS NULL').run(now(), deviceId).changes
				? text({ ok: true, deviceId })
				: failure('Device not found or already revoked.')
	)

	tool(
		'list_share_links',
		{
			title: 'List share links',
			description: 'Share links (never the link secret), with scope, opens and revocation.',
			inputSchema: {
				userId: userId.optional(),
				activeOnly: z.boolean().default(false),
				limit: z.number().int().min(1).max(100).default(25),
				offset: z.number().int().min(0).default(0),
			},
		},
		({ userId: owner, activeOnly, limit, offset }) =>
			text(
				database
					.query(
						`SELECT s.token_hash AS id,s.memory_id AS memoryId,m.name AS memoryName,s.user_id AS userId,s.scope,
 s.created_at AS createdAt,s.revoked_at AS revokedAt,s.open_count AS opens,s.last_opened_at AS lastOpenedAt
 FROM share_links s LEFT JOIN memories m ON m.id=s.memory_id
 WHERE (? IS NULL OR s.user_id=?) AND (?=0 OR s.revoked_at IS NULL) ORDER BY s.created_at DESC LIMIT ? OFFSET ?`
					)
					.all(owner ?? null, owner ?? null, Number(activeOnly), limit, offset)
			)
	)
	tool(
		'revoke_share_link',
		{
			title: 'Revoke share link',
			description: 'Revokes one share link by the id list_share_links returned.',
			inputSchema: { id: z.string().min(1).max(200) },
		},
		({ id }) =>
			database.query('UPDATE share_links SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').run(now(), id)
				.changes
				? text({ ok: true, id })
				: failure('Share link not found or already revoked.')
	)

	const phase = z.string().max(100).optional()
	tool(
		'list_diagnostics',
		{
			title: 'List diagnostics',
			description:
				'Grouped diagnostic issues (25 per page, page starts at 0), filterable by state, phase, source, version.',
			inputSchema: {
				state: issueState.or(z.literal('all')).default('all'),
				phase,
				source: phase,
				version: phase,
				page: z.number().int().min(0).max(100000).default(0),
			},
		},
		input => guarded(() => admin.diagnostics.list(as, input))
	)
	tool(
		'get_diagnostic',
		{
			title: 'Get diagnostic issue',
			description: 'One issue and its sanitized reports (20 per page, page starts at 0).',
			inputSchema: { fingerprint: z.string().min(1).max(200), page: z.number().int().min(0).max(100000).default(0) },
		},
		({ fingerprint, page }) => guarded(() => admin.diagnostics.detail(as, fingerprint, page))
	)
	tool(
		'set_diagnostic_state',
		{
			title: 'Set diagnostic state',
			description:
				'Moves an issue to open, in_progress, resolved or ignored (the current revision is applied for you).',
			inputSchema: { fingerprint: z.string().min(1).max(200), state: issueState },
		},
		({ fingerprint, state }) =>
			guarded(() => {
				const current = database
					.query('SELECT revision FROM diagnostic_issues WHERE fingerprint=?')
					.get(fingerprint) as {
					revision: number
				} | null
				if (!current) throw new ORPCError('NOT_FOUND')
				return admin.diagnostics.update(as, { fingerprint, state, revision: current.revision })
			})
	)

	tool(
		'moderation_summary',
		{ title: 'Moderation summary', description: 'Counts of pending and reported public-gallery publications.' },
		() => guarded(() => admin.discovery.queueSummary(as))
	)
	tool(
		'moderation_queue',
		{
			title: 'Moderation queue',
			description:
				'Public-gallery publications by state (pending, approved, rejected, reported), with reports. Page starts at 0.',
			inputSchema: {
				state: z.enum(['pending', 'approved', 'rejected', 'reported']).default('pending'),
				page: z.number().int().min(0).max(100000).default(0),
			},
		},
		input => guarded(() => admin.discovery.queue(as, input))
	)
	tool(
		'moderate_publication',
		{
			title: 'Moderate publication',
			description: 'Approves or rejects a public-gallery publication (clears its reports).',
			inputSchema: {
				id: z.uuid(),
				decision: z.enum(['approved', 'rejected']),
				reason: z.string().trim().max(500).default(''),
			},
		},
		({ id, decision, reason }) => guarded(() => admin.discovery.moderate(as, id, decision, reason))
	)
	tool(
		'unpublish_memory',
		{
			title: 'Unpublish capture',
			description: 'Takes a capture out of the public gallery (its publication becomes revoked).',
			inputSchema: { memoryId: z.uuid() },
		},
		({ memoryId }) =>
			guarded(() => {
				const owner = database.query('SELECT user_id FROM memories WHERE id=?').get(memoryId) as {
					user_id: string
				} | null
				if (!owner) throw new ORPCError('NOT_FOUND')
				return admin.discovery.revoke(owner.user_id, memoryId)
			})
	)
}
