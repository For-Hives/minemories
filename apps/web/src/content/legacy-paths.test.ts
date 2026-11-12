import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { publicMetadata } from '../route-metadata'
import { legacyPaths } from './legacy-paths'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const nginx = read('../../../../deploy/nginx.web.conf')
const smoke = read('../../../../scripts/smoke-web.mjs')
const rulePattern = /^\s*"~\^(\/[\w/-]+)\/\*\(\?<mm_q>\\\?\.\*\)\?\$" "(\/[\w/-]*)\$mm_q";$/gm
const nginxRedirects = Object.fromEntries([...nginx.matchAll(rulePattern)].map(match => [match[1], match[2]]))

test('nginx serves exactly the redirects of the client router, to the same targets', () => {
	expect(nginxRedirects).toEqual(legacyPaths)
})

test('every retired URL lands on a live page in one hop', () => {
	const pages = new Set(publicMetadata.map(page => page.path))
	for (const [from, to] of Object.entries(legacyPaths)) {
		expect(pages.has(from), `${from} is redirected, so it is no page of its own`).toBe(false)
		expect(Object.hasOwn(legacyPaths, to), `${to} is redirected again`).toBe(false)
		expect(pages.has(to), `${to} is a prerendered page`).toBe(true)
	}
})

test('the post-deployment smoke test checks every redirect', () => {
	for (const from of Object.keys(legacyPaths))
		expect(smoke).toMatch(new RegExp(`path: '${from}[/?'][^\\n]*status: 301`))
})
