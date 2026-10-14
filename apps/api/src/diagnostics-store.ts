import type { Database } from 'bun:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import type { ModDiagnostic } from '@minemories/api-contract'
import type { DiagnosticsPolicy } from './diagnostics-policy'

export interface ApiDiagnostic {
	id: string
	occurredAt: string
	source: 'api'
	phase: 'upload'
	versions: { api: '0.1.0' }
	correlationId: string
	exception: {
		type: string
		frames: Array<{ className: string; methodName: string; fileName?: string; lineNumber?: number }>
	}
	breadcrumbs: []
}
export type Diagnostic = ModDiagnostic | ApiDiagnostic
export type IngestionResult =
	| 'accepted'
	| 'duplicate'
	| 'conflict'
	| 'rate_limited'
	| 'disabled'
	| 'invalid_time'
	| 'consent_required'
	| 'unauthorized'
const HOUR = 3_600_000
export class DiagnosticsStore {
	constructor(
		readonly database: Database,
		readonly policy: DiagnosticsPolicy
	) {
		database.exec(`CREATE TABLE IF NOT EXISTS diagnostic_reports (
		 device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
		 id TEXT NOT NULL, user_id TEXT NOT NULL, received_at INTEGER NOT NULL,
		 fingerprint TEXT NOT NULL, report_json TEXT NOT NULL,
		 PRIMARY KEY(device_id, id));
		 CREATE INDEX IF NOT EXISTS diagnostic_reports_received ON diagnostic_reports(received_at);
		 CREATE TABLE IF NOT EXISTS diagnostic_rates (
		 device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
		 window_at INTEGER NOT NULL, count INTEGER NOT NULL);
		 CREATE TABLE IF NOT EXISTS diagnostic_consents (
		 device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE, permit TEXT NOT NULL);
		 CREATE TABLE IF NOT EXISTS diagnostic_consent_rates (
		 device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
		 window_at INTEGER NOT NULL, count INTEGER NOT NULL);`)
	}
	cleanup(now = Date.now()): void {
		this.database
			.query(`DELETE FROM diagnostic_reports WHERE received_at <= ?
		 OR device_id IN (SELECT id FROM devices WHERE revoked_at IS NOT NULL)`)
			.run(now - this.policy.retentionMs)
		this.database
			.query(`DELETE FROM diagnostic_rates WHERE window_at <= ?
		 OR device_id IN (SELECT id FROM devices WHERE revoked_at IS NOT NULL)`)
			.run(now - HOUR)
		this.database
			.query(`DELETE FROM diagnostic_consent_rates WHERE window_at <= ?
		 OR device_id IN (SELECT id FROM devices WHERE revoked_at IS NOT NULL)`)
			.run(now - 60_000)
		this.database
			.query('DELETE FROM diagnostic_consents WHERE device_id IN (SELECT id FROM devices WHERE revoked_at IS NOT NULL)')
			.run()
		this.trim('SELECT rowid FROM diagnostic_reports ORDER BY received_at DESC, rowid DESC LIMIT -1 OFFSET ?', [
			this.policy.global,
		])
		this.database
			.query(`DELETE FROM diagnostic_reports WHERE rowid IN (
		 SELECT rowid FROM (SELECT rowid, ROW_NUMBER() OVER (
		 PARTITION BY device_id ORDER BY received_at DESC, rowid DESC) AS rank FROM diagnostic_reports)
		 WHERE rank > ?)`)
			.run(this.policy.perDevice)
	}
	private trim(query: string, parameters: Array<string | number>): void {
		this.database.query(`DELETE FROM diagnostic_reports WHERE rowid IN (${query})`).run(...parameters)
	}
	purge(deviceId: string): number {
		return this.database
			.transaction(() => {
				this.database.query('DELETE FROM diagnostic_consents WHERE device_id = ?').run(deviceId)
				return this.database.query('DELETE FROM diagnostic_reports WHERE device_id = ?').run(deviceId).changes
			})
			.immediate()
	}
	private active(deviceId: string): boolean {
		return Boolean(this.database.query('SELECT id FROM devices WHERE id = ? AND revoked_at IS NULL').get(deviceId))
	}
	beginConsent(deviceId: string, now = Date.now()): string | null {
		return this.database
			.transaction(() => {
				if (!(this.policy.enabled && this.active(deviceId))) return null
				this.cleanup(now)
				const rate = this.database
					.query('SELECT count FROM diagnostic_consent_rates WHERE device_id = ?')
					.get(deviceId) as { count: number } | null
				if (rate && rate.count >= 5) return null
				this.database
					.query(`INSERT INTO diagnostic_consent_rates(device_id, window_at, count) VALUES (?, ?, 1)
			 ON CONFLICT(device_id) DO UPDATE SET count = count + 1`)
					.run(deviceId, now)
				const permit = randomUUID()
				this.database
					.query(`INSERT INTO diagnostic_consents(device_id, permit) VALUES (?, ?)
			 ON CONFLICT(device_id) DO UPDATE SET permit = excluded.permit`)
					.run(deviceId, permit)
				return permit
			})
			.immediate()
	}
	accept(
		device: { id: string; userId: string },
		report: Diagnostic,
		permit: string,
		now = Date.now()
	): IngestionResult {
		if (!this.policy.enabled) return 'disabled'
		const occurred = Date.parse(report.occurredAt)
		if (!Number.isFinite(occurred) || occurred > now + 300_000 || occurred < now - 90 * 86_400_000)
			return 'invalid_time'
		return this.database
			.transaction(() => {
				if (!this.active(device.id)) return 'unauthorized'
				const consent = this.database
					.query('SELECT permit FROM diagnostic_consents WHERE device_id = ?')
					.get(device.id) as { permit: string } | null
				if (!consent || consent.permit !== permit) return 'consent_required'
				return this.insert(device, report, now)
			})
			.immediate()
	}
	private insert(device: { id: string; userId: string }, report: Diagnostic, now: number): IngestionResult {
		this.cleanup(now)
		const json = JSON.stringify(report)
		const previous = this.database
			.query('SELECT report_json FROM diagnostic_reports WHERE device_id = ? AND id = ?')
			.get(device.id, report.id) as { report_json: string } | null
		if (previous) return previous.report_json === json ? 'duplicate' : 'conflict'
		const rate = this.database.query('SELECT count FROM diagnostic_rates WHERE device_id = ?').get(device.id) as {
			count: number
		} | null
		if (rate && rate.count >= this.policy.perHour) return 'rate_limited'
		this.database
			.query(`INSERT INTO diagnostic_rates(device_id, window_at, count) VALUES (?, ?, 1)
		 ON CONFLICT(device_id) DO UPDATE SET count = count + 1`)
			.run(device.id, now)
		const fingerprint = createHash('sha256')
			.update(
				JSON.stringify([
					report.source,
					report.phase,
					report.exception.type,
					...report.exception.frames
						.slice(0, 5)
						.map(frame => [frame.className, frame.methodName, frame.fileName, frame.lineNumber]),
				])
			)
			.digest('hex')
		this.database
			.query(`INSERT INTO diagnostic_reports(device_id, id, user_id, received_at, fingerprint, report_json)
		 VALUES (?, ?, ?, ?, ?, ?)`)
			.run(device.id, report.id, device.userId, now, fingerprint, json)
		this.cleanup(now)
		return 'accepted'
	}
}
