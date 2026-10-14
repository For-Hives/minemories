import { spawnSync } from 'node:child_process'
import { rename, rm, symlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { prerenderWeb } from './prerender-web.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const web = resolve(root, 'apps/web')
	const vite = resolve(web, 'node_modules/vite/bin/vite.js')
	const server = resolve(root, 'work/web-ssr')
	for (const args of [['build'], ['build', '--ssr', 'src/prerender.tsx', '--outDir', server, '--emptyOutDir']]) {
		const result = spawnSync(process.execPath, [vite, ...args], { cwd: web, stdio: 'inherit' })
		if (result.error) throw result.error
		if (result.status !== 0) process.exit(result.status ?? 1)
	}
	await symlink(resolve(web, 'node_modules'), resolve(server, 'node_modules'), 'dir')
	await rm(resolve(web, 'dist/downloads'), { recursive: true, force: true })
	const entry = resolve(server, 'prerender.mjs')
	await rename(resolve(server, 'prerender.js'), entry)
	const routes = await prerenderWeb(resolve(web, 'dist'), await import(pathToFileURL(entry).href))
	console.log(`Prerendered ${routes.length} public pages; private application routes are excluded.`)
}
