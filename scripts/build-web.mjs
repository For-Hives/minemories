import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyModArtifact } from './verify-mod-artifact.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export async function verifyWebDownload(directory) {
	try {
		const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'))
		return await verifyModArtifact(directory, manifest?.sha256)
	} catch (cause) {
		throw new Error(
			'Cannot build a site without a valid Minemories JAR. Run bun mod:build and bun run package:mod first.',
			{ cause }
		)
	}
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const web = resolve(root, 'apps/web')
	await verifyWebDownload(resolve(web, 'public/downloads'))
	const result = spawnSync(process.execPath, [resolve(web, 'node_modules/vite/bin/vite.js'), 'build'], {
		cwd: web,
		stdio: 'inherit',
	})
	if (result.error) throw result.error
	if (result.status !== 0) process.exit(result.status ?? 1)
	await verifyWebDownload(resolve(web, 'dist/downloads'))
}
