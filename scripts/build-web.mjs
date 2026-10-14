import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const web = resolve(root, 'apps/web')
	const result = spawnSync(process.execPath, [resolve(web, 'node_modules/vite/bin/vite.js'), 'build'], {
		cwd: web,
		stdio: 'inherit',
	})
	if (result.error) throw result.error
	if (result.status !== 0) process.exit(result.status ?? 1)
}
