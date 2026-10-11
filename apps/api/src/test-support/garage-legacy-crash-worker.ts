import type { Database } from 'bun:sqlite'

const source = process.env.LEGACY_SOURCE
const owner = process.env.LEGACY_OWNER
if (
	!(
		source &&
		owner &&
		process.env.RUN_GARAGE_INTEGRATION === '1' &&
		process.env.S3_BUCKET?.startsWith('minemories-integration')
	)
) {
	throw new Error('Dedicated legacy crash fixture required')
}
const { app } = await import('../index')
const { database } = await import('../database')
const { createPairingCode, exchangePairingCode } = await import('../pairing')
const originalQuery = database.query.bind(database)
database.query = ((sql: string) => {
	if (sql.startsWith('INSERT INTO memories ')) process.exit(23)
	return originalQuery(sql)
}) as Database['query']
const device = exchangePairingCode(createPairingCode(owner).code, 'Legacy crash fixture')
if (!device) throw new Error('Fixture pairing failed')
await app.request('/api/mod/memories', {
	method: 'POST',
	headers: { authorization: `Bearer ${device.deviceToken}`, 'content-type': 'model/gltf-binary' },
	body: await Bun.file(source).arrayBuffer(),
})
throw new Error('Legacy fixture failed to stop after object storage')
