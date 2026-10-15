import type { Database } from 'bun:sqlite'
import type { CaptureAvailability } from '@minemories/api-contract'
import { ORPCError } from '@orpc/server'
import { ColdStorageCatalog } from './cold-storage-catalog'
import type { ObjectTierState } from './object-tiers'
import { TimelapseCatalog } from './timelapse-catalog'

interface PartState {
	state: ObjectTierState
	restore_requested: number
}
function aggregate(rows: PartState[]): CaptureAvailability['state'] {
	if (rows.some(row => row.state === 'restoring' || row.restore_requested === 1)) return 'restoring'
	if (rows.some(row => row.state === 'archiving')) return 'archiving'
	if (rows.some(row => row.state === 'cold')) return 'cold'
	return 'ready'
}

/** Authorization is resolved synchronously inside the same transaction as the complete manifest and restore intent. */
export class CaptureStorage {
	constructor(
		private readonly database: Database,
		private readonly enabled = false
	) {}

	status(lookup: () => string | null, restore = false, now = Date.now()): CaptureAvailability {
		return this.database
			.transaction(() => {
				const key = lookup()
				if (!(key && this.database.query('SELECT 1 FROM memories WHERE object_key=?').get(key)))
					throw new ORPCError('NOT_FOUND')
				const manifest = new TimelapseCatalog(this.database).manifest(key)
				const keys = [...new Set(manifest ? manifest.parts.map(part => part.objectKey) : [key])]
				if (restore) {
					if (!this.enabled)
						throw new ORPCError('SERVICE_UNAVAILABLE', { message: 'Capture restoration is not enabled.' })
					new ColdStorageCatalog(this.database).requestRestore(keys, now)
				}
				const rows = this.database
					.query(`SELECT COALESCE(t.state,'hot') AS state,
			 COALESCE(t.restore_requested,0) AS restore_requested FROM json_each(?) k
			 LEFT JOIN object_tiers t ON t.object_key=k.value`)
					.all(JSON.stringify(keys)) as PartState[]
				const state = aggregate(rows)
				return {
					state,
					readyObjects: rows.filter(row => row.state === 'hot').length,
					totalObjects: rows.length,
					restorationAvailable: this.enabled,
					retryAfterSeconds: state === 'ready' || !this.enabled ? null : 5,
				}
			})
			.immediate()
	}
}
