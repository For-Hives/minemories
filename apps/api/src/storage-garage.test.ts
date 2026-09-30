import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { minimalGlb } from './test-support/glb-fixture'

// Opt in with a dedicated Garage test bucket and S3 credentials; never touch real captures.
test.skipIf(process.env.RUN_GARAGE_INTEGRATION !== '1')(
	'real Garage preserves GLB bytes and deletes only the test object',
	async () => {
		process.env.STORAGE_DRIVER = 's3'
		const { storeMemory, readMemory, removeMemory } = await import('./storage')
		const key = `integration-tests/${randomUUID()}.glb`
		const glb = minimalGlb()
		try {
			await storeMemory(key, glb)
			expect((await readMemory(key)).toString('hex')).toBe(glb.toString('hex'))
			await removeMemory(key)
			await expect(readMemory(key)).rejects.toThrow()
		} finally {
			await removeMemory(key)
		}
	}
)
