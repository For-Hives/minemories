import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import english from './locales/en.json'

const sourceRoot = fileURLToPath(new URL('..', import.meta.url))
// A literal key passed to t(), i18n.t() or a `message` prop (<T>, <Rich>): `t('Sign in')`, `message={'Your first memory'}`.
const literalKey = /(?<![\w.])(?:t|i18n\.t)\(\s*(['"])((?:\\.|(?!\1).)*)\1|\bmessage=\{?\s*(['"])((?:\\.|(?!\3).)*)\3/g

function sources(directory: string): string[] {
	return readdirSync(directory).flatMap(name => {
		const path = join(directory, name)
		if (statSync(path).isDirectory()) return name === 'locales' || name === 'testing' ? [] : sources(path)
		return /\.(tsx?|js)$/.test(name) && !name.includes('.test.') ? [path] : []
	})
}

test('every literal translation key in the web sources exists in the English catalogue', () => {
	const missing: string[] = []
	let found = 0
	for (const file of sources(sourceRoot)) {
		for (const match of readFileSync(file, 'utf8').matchAll(literalKey)) {
			const key = (match[2] ?? match[4] ?? '').replace(/\\(.)/g, '$1')
			found += 1
			if (!Object.hasOwn(english, key)) missing.push(`${relative(sourceRoot, file)}: ${key}`)
		}
	}
	// Guards the pattern itself: if it stopped matching, the check would pass on nothing.
	expect(found).toBeGreaterThan(500)
	expect(missing).toEqual([])
})
