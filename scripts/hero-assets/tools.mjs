// The real tools: meshoptimizer (decode + encode), oxipng (WASM, run in Node), and three's own meshopt decoder as the
// independent decoder of the proof. Nothing is downloaded: everything comes from locked npm packages.
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = join(import.meta.dirname, '..', '..')
const requireFromRoot = createRequire(join(root, 'package.json'))
const requireFromWeb = createRequire(join(root, 'apps/web/package.json'))
/** Folder of an installed package, found the way a bare import would find it (some packages hide their package.json from `exports`). */
const packageDir = (require, name) => {
	const folder = require.resolve
		.paths(name)
		?.map(base => join(base, name))
		.find(candidate => existsSync(join(candidate, 'package.json')))
	if (!folder) throw new Error(`package ${name} is not installed (run bun install)`)
	return folder
}
const versionOf = (require, name) =>
	JSON.parse(readFileSync(join(packageDir(require, name), 'package.json'), 'utf8')).version

/** three registers `KHR_meshopt_compression` next to the `EXT_` name: the rebuilt captures rely on it (docs/features/film-assets-pipeline.md). */
export function assertThreeAcceptsKhrMeshopt() {
	const loader = readFileSync(requireFromWeb.resolve('three/addons/loaders/GLTFLoader.js'), 'utf8')
	for (const name of ['EXT_meshopt_compression', 'KHR_meshopt_compression'])
		if (!loader.includes(`'${name}'`))
			throw new Error(`three's GLTFLoader no longer knows ${name}: the rebuilt captures would not load`)
}

export async function realTools() {
	assertThreeAcceptsKhrMeshopt()
	const { MeshoptDecoder, MeshoptEncoder } = await import('meshoptimizer')
	const oxipngPackage = packageDir(requireFromRoot, '@jsquash/oxipng')
	const { default: optimise, init } = await import(pathToFileURL(join(oxipngPackage, 'optimise.js')).href)
	await init(readFileSync(join(oxipngPackage, 'codec/pkg/squoosh_oxipng_bg.wasm')))
	const three = await import(pathToFileURL(requireFromWeb.resolve('three/addons/libs/meshopt_decoder.module.js')).href)
	return {
		rebuildTools: {
			decoder: MeshoptDecoder,
			encoder: MeshoptEncoder,
			optimisePng: async png => {
				const buffer = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength)
				return new Uint8Array(await optimise(buffer, { level: 6, interlace: false, optimiseAlpha: false }))
			},
		},
		proofDecoder: three.MeshoptDecoder,
		toolchain: {
			meshoptimizer: versionOf(requireFromRoot, 'meshoptimizer'),
			oxipng: versionOf(requireFromRoot, '@jsquash/oxipng'),
			three: versionOf(requireFromWeb, 'three'),
		},
	}
}
