import { Database } from 'bun:sqlite'
import { PublicDiscovery } from '../discovery'

const [path, id, user, action] = Bun.argv.slice(2)
if (!(path && id && user)) throw new Error('Missing discovery worker fixture')
const database = new Database(path)
database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
try {
	const discovery = new PublicDiscovery(database, new Set())
	const result = action === 'revoke' ? discovery.revoke(user, id) : discovery.vote(user, id, true)
	process.stdout.write(`${JSON.stringify(result)}\n`)
} catch (error) {
	if (!(error instanceof Error && 'code' in error && error.code === 'NOT_FOUND')) throw error
	process.stdout.write(`${JSON.stringify({ code: 'NOT_FOUND' })}\n`)
} finally {
	database.close()
}
