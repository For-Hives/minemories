import type { Database } from 'bun:sqlite'

export class ObjectDeletionQueue {
	private running = false

	constructor(
		private readonly database: Database,
		private readonly remove: (key: string) => Promise<void>
	) {}

	async maintain(now = Date.now()): Promise<void> {
		try {
			await this.drain(undefined, now)
		} catch {
			console.error('[object-deletions] queue pass failed; pending jobs remain in SQLite')
		}
	}

	async drain(objectKey?: string, now = Date.now()): Promise<void> {
		if (this.running) return
		this.running = true
		try {
			const rows =
				objectKey === undefined
					? this.database
							.query(
								'SELECT object_key, attempts FROM object_deletions WHERE next_attempt_at <= ? ORDER BY created_at LIMIT 100'
							)
							.all(now)
					: this.database
							.query('SELECT object_key, attempts FROM object_deletions WHERE object_key = ? AND next_attempt_at <= ?')
							.all(objectKey, now)
			for (const row of rows as Array<{ object_key: string; attempts: number }>) {
				// biome-ignore lint/performance/noAwaitInLoops: one bounded batch avoids flooding an unavailable object store.
				await this.attempt(row, now)
			}
		} finally {
			this.running = false
		}
	}

	private async attempt(row: { object_key: string; attempts: number }, now: number): Promise<void> {
		try {
			await this.remove(row.object_key)
			this.database.query('DELETE FROM object_deletions WHERE object_key = ?').run(row.object_key)
		} catch {
			const delay = Math.min(3_600_000, 60_000 * 2 ** Math.min(row.attempts, 6))
			this.database
				.query('UPDATE object_deletions SET attempts = attempts + 1, next_attempt_at = ? WHERE object_key = ?')
				.run(now + delay, row.object_key)
		}
	}
}
