// The mod refuses to write a GLB the API would refuse (GlbLimits.java): its limits must stay the contract's.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))

/** Evaluates a constant written as digits, `_` separators and `*` only (`4 * 1024 * 1024`, `16_384`). */
function value(expression) {
	assert.match(expression, /^[\d_ *]+$/, `unexpected constant ${expression}`)
	return expression
		.split('*')
		.map(part => Number(part.trim().replaceAll('_', '')))
		.reduce((product, factor) => product * factor, 1)
}

async function constants(paths, pattern) {
	const found = {}
	const texts = await Promise.all(paths.map(path => readFile(join(root, path), 'utf8')))
	for (const text of texts) for (const match of text.matchAll(pattern)) found[match[1]] = value(match[2])
	return found
}

test("the mod's GLB limits are the API contract's", async () => {
	const java = await constants(
		['mod/shared/core/src/main/java/dev/minemories/core/GlbLimits.java'],
		/public static final int (\w+) = ([\d_ *]+);/g
	)
	const contract = await constants(
		[
			'packages/api-contract/src/glb.ts',
			'packages/api-contract/src/glb-images.ts',
			'packages/api-contract/src/glb-geometry.ts',
			'packages/api-contract/src/glb-scenes.ts',
			'packages/api-contract/src/glb-layout.ts',
		],
		/export const (MAX_GLB_\w+) = ([\d_ *]+)\n/g
	)
	const pairs = {
		JSON_BYTES: 'MAX_GLB_JSON_BYTES',
		IMAGES: 'MAX_GLB_IMAGES',
		TEXTURES: 'MAX_GLB_TEXTURES',
		PRIMITIVES: 'MAX_GLB_PRIMITIVES',
		NODES: 'MAX_GLB_NODES',
		ENTRIES: 'MAX_GLB_ENTRIES',
	}
	assert.deepEqual(Object.keys(java).sort(), Object.keys(pairs).sort())
	for (const [mod, api] of Object.entries(pairs)) assert.equal(java[mod], contract[api], `${mod} = ${api}`)
})
