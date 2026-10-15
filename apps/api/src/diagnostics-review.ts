import { storedDiagnostic } from '@minemories/api-contract'
import { ORPCError } from '@orpc/server'
import type { DiagnosticsStore } from './diagnostics-store'

type IssueState = 'open' | 'in_progress' | 'resolved' | 'ignored'
interface GroupRow {
	fingerprint: string
	state: IssueState
	revision: number
	count: number
	devices: number
	firstReceivedAt: number
	lastReceivedAt: number
	updatedAt: number | null
	reportJson: string
}
const groupQuery = `SELECT r.fingerprint, i.state, i.revision, i.updated_at AS updatedAt,
 COUNT(*) AS count, COUNT(DISTINCT r.device_id) AS devices,
 MIN(r.received_at) AS firstReceivedAt, MAX(r.received_at) AS lastReceivedAt,
 (SELECT latest.report_json FROM diagnostic_reports latest WHERE latest.fingerprint = r.fingerprint
 ORDER BY latest.received_at DESC, latest.rowid DESC LIMIT 1) AS reportJson
 FROM diagnostic_reports r JOIN diagnostic_issues i ON i.fingerprint = r.fingerprint`

function issue(row: GroupRow) {
	const { reportJson, ...fields } = row
	return { ...fields, lastReport: storedDiagnostic.parse(JSON.parse(reportJson)) }
}
export class DiagnosticsReview {
	constructor(
		private readonly store: DiagnosticsStore,
		private readonly operators: ReadonlySet<string>
	) {}
	allowed(userId: string | null): boolean {
		return userId !== null && this.operators.has(userId)
	}
	private operator(userId: string | null): string {
		if (!userId) throw new ORPCError('UNAUTHORIZED')
		if (!this.allowed(userId)) throw new ORPCError('FORBIDDEN')
		return userId
	}
	list(
		userId: string | null,
		input: {
			state: IssueState | 'all'
			phase?: string | undefined
			source?: string | undefined
			version?: string | undefined
			page: number
		}
	) {
		this.operator(userId)
		this.store.cleanup()
		const conditions: string[] = []
		const values: Array<string | number> = []
		if (input.state !== 'all') {
			conditions.push('i.state = ?')
			values.push(input.state)
		}
		for (const [field, value] of [
			['phase', input.phase],
			['source', input.source],
		]) {
			if (value) {
				conditions.push(`json_extract(r.report_json, '$.${field}') = ?`)
				values.push(value)
			}
		}
		if (input.version) {
			conditions.push(
				"COALESCE(json_extract(r.report_json, '$.versions.mod'), json_extract(r.report_json, '$.versions.api')) = ?"
			)
			values.push(input.version)
		}
		const filter = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
		const rows = this.store.database
			.query(`WITH filtered_reports AS (SELECT r.rowid AS rowid, r.* FROM diagnostic_reports r JOIN diagnostic_issues i ON i.fingerprint = r.fingerprint${filter})
 ${groupQuery.replaceAll('diagnostic_reports', 'filtered_reports')} GROUP BY r.fingerprint
 ORDER BY lastReceivedAt DESC, r.fingerprint LIMIT 26 OFFSET ?`)
			.all(...values, input.page * 25) as GroupRow[]
		return { items: rows.slice(0, 25).map(issue), hasMore: rows.length > 25 }
	}
	detail(userId: string | null, fingerprint: string, page: number) {
		this.operator(userId)
		this.store.cleanup()
		const group = this.store.database
			.query(`${groupQuery} WHERE r.fingerprint = ? GROUP BY r.fingerprint`)
			.get(fingerprint) as GroupRow | null
		if (!group) throw new ORPCError('NOT_FOUND')
		const rows = this.store.database
			.query(`SELECT device_id AS deviceId, received_at AS receivedAt, report_json AS reportJson
 FROM diagnostic_reports WHERE fingerprint = ? ORDER BY received_at DESC, rowid DESC LIMIT 21 OFFSET ?`)
			.all(fingerprint, page * 20) as Array<{ deviceId: string; receivedAt: number; reportJson: string }>
		return {
			issue: issue(group),
			items: rows
				.slice(0, 20)
				.map(({ reportJson, ...fields }) => ({ ...fields, report: storedDiagnostic.parse(JSON.parse(reportJson)) })),
			hasMore: rows.length > 20,
		}
	}
	update(userId: string | null, input: { fingerprint: string; state: IssueState; revision: number }) {
		const actor = this.operator(userId)
		return this.store.database
			.transaction(() => {
				this.store.cleanup()
				const existing = this.store.database
					.query('SELECT revision FROM diagnostic_issues WHERE fingerprint = ?')
					.get(input.fingerprint) as { revision: number } | null
				if (!existing) throw new ORPCError('NOT_FOUND')
				if (existing.revision !== input.revision)
					throw new ORPCError('CONFLICT', { message: 'Diagnostics changed. Refresh before updating.' })
				this.store.database
					.query(
						`UPDATE diagnostic_issues SET state = ?, revision = revision + 1, updated_at = ?, updated_by = ? WHERE fingerprint = ?`
					)
					.run(input.state, Date.now(), actor, input.fingerprint)
				return { ok: true as const }
			})
			.immediate()
	}
}
