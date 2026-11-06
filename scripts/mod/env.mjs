// Loads the repository .env without overriding variables already set in the environment.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { repositoryRoot } from './utils.mjs'

const linePattern = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/
const lineBreak = /\r?\n/
const trailingComment = /\s+#.*$/

export function parseEnv(text) {
	const values = {}
	for (const line of text.split(lineBreak)) {
		if (line.trimStart().startsWith('#')) continue
		const match = linePattern.exec(line)
		if (!match) continue
		let value = match[2]
		const quote = value[0]
		const quoted = (quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)
		value = quoted ? value.slice(1, -1) : value.replace(trailingComment, '')
		values[match[1]] = value
	}
	return values
}

/** Returns { ...fileValues, ...baseEnv } (the existing environment wins) and exports the missing keys to it. */
export async function loadEnv({ root = repositoryRoot, base = process.env } = {}) {
	let text = ''
	try {
		text = await readFile(resolve(root, '.env'), 'utf8')
	} catch {
		// no .env: the environment alone is used
	}
	const merged = { ...parseEnv(text), ...base }
	if (base === process.env) for (const [key, value] of Object.entries(merged)) base[key] ??= value
	return merged
}
