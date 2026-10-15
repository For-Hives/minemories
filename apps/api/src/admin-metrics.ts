import type { Database } from 'bun:sqlite'
import type { AdminSummary } from '@minemories/api-contract'
import type { AdminRoles } from './admin-roles'

const HOUR = 3600000
/** Aggregate only committed registrations and memory publications; no client tracking or object reads. */
export class AdminMetrics {
	constructor(
		private readonly database: Database,
		private readonly roles: AdminRoles,
		now = Date.now()
	) {
		database.exec(`CREATE TABLE IF NOT EXISTS admin_metrics_meta (id INTEGER PRIMARY KEY CHECK(id=1),started_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS admin_hourly_metrics(hour INTEGER PRIMARY KEY,signups INTEGER NOT NULL DEFAULT 0,uploads INTEGER NOT NULL DEFAULT 0,uploaded_bytes INTEGER NOT NULL DEFAULT 0);
   CREATE TRIGGER IF NOT EXISTS admin_registration_metric AFTER INSERT ON user BEGIN
    INSERT INTO admin_hourly_metrics(hour,signups) VALUES (CAST(strftime('%s','now') AS INTEGER)/3600*3600000,1)
    ON CONFLICT(hour) DO UPDATE SET signups=signups+1;
   END;
   CREATE TRIGGER IF NOT EXISTS admin_upload_metric AFTER INSERT ON memories BEGIN
    INSERT INTO admin_hourly_metrics(hour,uploads,uploaded_bytes) VALUES (CAST(strftime('%s','now') AS INTEGER)/3600*3600000,1,NEW.size)
    ON CONFLICT(hour) DO UPDATE SET uploads=uploads+1,uploaded_bytes=uploaded_bytes+NEW.size;
   END;`)
		database.query('INSERT OR IGNORE INTO admin_metrics_meta VALUES (1,?)').run(now)
	}
	summary(actorId: string | null, hours: 24 | 168 | 720, now = Date.now()): AdminSummary {
		this.roles.require(actorId)
		const from = Math.floor(now / HOUR) * HOUR - (hours - 1) * HOUR
		const started = (
			this.database.query('SELECT started_at FROM admin_metrics_meta WHERE id=1').get() as { started_at: number }
		).started_at
		const rows = this.database
			.query(
				'SELECT hour AS at,signups,uploads,uploaded_bytes AS uploadedBytes FROM admin_hourly_metrics WHERE hour>=? AND hour<=? ORDER BY hour'
			)
			.all(from, now) as Array<{ at: number; signups: number; uploads: number; uploadedBytes: number }>
		const byHour = new Map(rows.map(row => [row.at, row]))
		const series = Array.from({ length: hours }, (_, i) => {
			const at = from + i * HOUR,
				values = byHour.get(at) ?? { signups: 0, uploads: 0, uploadedBytes: 0 }
			let coverage: 'none' | 'partial' | 'full' = 'full'
			if (at + HOUR <= started) coverage = 'none'
			else if (at < started || at + HOUR > now) coverage = 'partial'
			return { ...values, at, coverage }
		})
		const totals = this.database
			.query(`SELECT
   (SELECT COUNT(*) FROM user) AS users,(SELECT COUNT(*) FROM user_roles) AS admins,
   (SELECT COUNT(*) FROM memories) AS memories,(SELECT COALESCE(SUM(size),0) FROM memories) AS storedBytes,
   (SELECT COALESCE(SUM(size),0) FROM memories WHERE deleted_at IS NOT NULL) AS trashBytes,
   (SELECT COALESCE(SUM(size),0) FROM object_deletions) AS pendingDeletionBytes,
   (SELECT COALESCE(SUM(size),0) FROM mod_uploads WHERE completed=0) AS reservedBytes,
   (SELECT COUNT(*) FROM session WHERE (CASE WHEN typeof(expiresAt)='text' THEN unixepoch(expiresAt)*1000 ELSE expiresAt END)>?) AS sessions,
   (SELECT COUNT(*) FROM devices WHERE revoked_at IS NULL) AS devices,
   (SELECT COUNT(*) FROM public_publications p JOIN memories m ON m.id=p.memory_id WHERE p.state='approved' AND m.deleted_at IS NULL) AS publicCaptures,
   (SELECT COUNT(*) FROM object_tiers WHERE state='cold') AS coldObjects,
   (SELECT COUNT(*) FROM object_tiers WHERE state='restoring') AS restoringObjects`)
			.get(now) as AdminSummary['totals']
		const period = series.reduce(
			(sum, row) => ({
				signups: sum.signups + row.signups,
				uploads: sum.uploads + row.uploads,
				uploadedBytes: sum.uploadedBytes + row.uploadedBytes,
			}),
			{ signups: 0, uploads: 0, uploadedBytes: 0 }
		)
		return { trackingStartedAt: started, from, to: now, totals, period, series }
	}
}
