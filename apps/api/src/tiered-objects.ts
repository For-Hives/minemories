import type { Database } from 'bun:sqlite'
import { assertObjectsHot } from './object-tiers'
import { TierLocations } from './tier-locations'
import type { TimelapseObjects } from './timelapse-files'

/** Logical authorization/leases remain above this layer; the storage provider only sees the selected physical key. */
export class TieredObjects implements TimelapseObjects {
	private readonly locations: TierLocations
	constructor(
		private readonly database: Database,
		private readonly raw: TimelapseObjects,
		private readonly removeRaw: (key: string) => Promise<void>
	) {
		this.locations = new TierLocations(database)
	}
	async read(key: string, signal: AbortSignal) {
		signal.throwIfAborted()
		assertObjectsHot(this.database, [key])
		return await this.raw.read(this.locations.resolve(key), signal)
	}
	async write(key: string, data: Buffer, signal: AbortSignal) {
		assertObjectsHot(this.database, [key])
		if (this.locations.resolve(key) !== key || this.locations.physicalInUse(key))
			throw new Error('Published storage generations are immutable')
		return await this.raw.write(key, data, signal)
	}
	async remove(key: string, removeOriginal = this.removeRaw): Promise<void> {
		const physical = this.locations.resolve(key)
		if (physical !== key) await this.removeRaw(physical)
		await removeOriginal(key)
		this.locations.forget(key, physical)
	}
}
