import { Database } from 'bun:sqlite'
import { ObjectDeletionQueue } from '../object-deletions'

if (
	process.env.RUN_GARAGE_INTEGRATION !== '1' ||
	!process.env.S3_BUCKET?.startsWith('minemories-integration') ||
	!process.env.DELETION_DB
) {
	throw new Error('Dedicated deletion fixture required')
}
const { removeMemory } = await import('../storage')
const database = new Database(process.env.DELETION_DB)
try {
	await new ObjectDeletionQueue(database, removeMemory).drain(
		undefined,
		Date.now() + Number(process.env.DELETION_TIME_SHIFT ?? 0)
	)
	process.stdout.write(`${JSON.stringify(database.query('SELECT COUNT(*) AS pending FROM object_deletions').get())}\n`)
} finally {
	database.close()
}
