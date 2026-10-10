import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const lineBreak = /\r?\n/

export async function productionSources(directory) {
	const entries = await readdir(directory, { withFileTypes: true })
	const groups = await Promise.all(
		entries.map(entry => {
			const path = resolve(directory, entry.name)
			if (entry.isDirectory() && entry.name !== 'test-support') return productionSources(path)
			if (
				entry.isFile() &&
				entry.name.endsWith('.ts') &&
				!entry.name.endsWith('.test.ts') &&
				!entry.name.endsWith('.d.ts')
			)
				return [path]
			return []
		})
	)
	return groups.flat()
}

export function missingCoverage(report, sources, directory) {
	const reported = new Set(
		report
			.split(lineBreak)
			.filter(line => line.startsWith('SF:'))
			.map(line => resolve(directory, line.slice(3)))
	)
	return sources.filter(path => !reported.has(resolve(path)))
}

export async function checkApiCoverage(directory) {
	const report = await readFile(resolve(directory, 'coverage/lcov.info'), 'utf8')
	const sources = await productionSources(resolve(directory, 'src'))
	const missing = missingCoverage(report, sources, directory)
	if (missing.length) throw new Error(`API sources missing from coverage:\n${missing.join('\n')}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await checkApiCoverage(fileURLToPath(new URL('../apps/api/', import.meta.url)))
}
