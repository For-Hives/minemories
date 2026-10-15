import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { filenameFor } from './release-utils.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const versionPattern = '\\d+\\.\\d+\\.\\d+(?:[-+][\\w.-]+)?'
const prefixes = Object.freeze({ neoforge: 'minemories-', fabric: 'minemories-fabric-', forge: 'minemories-forge-' })
const targets = JSON.parse(readFileSync(resolve(root, 'config/mod-targets.json'), 'utf8')).targets

export function modArtifact(loader = 'neoforge') {
	if (!Object.hasOwn(prefixes, loader)) throw new Error('Unknown mod loader.')
	const target = targets.find(item => item.loader === loader)
	if (!target?.loaderVersion) throw new Error('Missing configured mod target.')
	return { ...target, prefix: prefixes[loader], downloadFilename: filenameFor(target) }
}
export const downloadFilename = 'minemories-neoforge-mc1.21.1.jar'

export async function packageMod(sourceDirectory, targetDirectory, options = {}) {
	if (typeof options === 'string') options = { loader: options }
	const artifact = modArtifact(options.target?.loader ?? options.loader)
	const target = options.target ?? artifact
	const jarPattern = new RegExp(`^${artifact.prefix}${versionPattern}\\.jar$`)
	const filename = filenameFor(target)
	const jars = (await readdir(sourceDirectory)).filter(
		name => !['-sources.jar', '-javadoc.jar', '-dev.jar'].some(suffix => name.endsWith(suffix)) && jarPattern.test(name)
	)
	if (jars.length !== 1) throw new Error('Expected exactly one built Minemories mod JAR; clean stale builds first.')
	const source = resolve(sourceDirectory, jars[0])
	const bytes = await readFile(source)
	if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50)
		throw new Error('The mod artifact is not a JAR archive.')
	const sha256 = createHash('sha256').update(bytes).digest('hex')
	const version = jars[0].slice(artifact.prefix.length, -'.jar'.length)
	if (options.version && version !== options.version)
		throw new Error('The built JAR version differs from the planned release.')
	const manifest = {
		version,
		minecraft: target.minecraft,
		loader: target.name,
		loaderVersion: target.loaderVersion,
		...(target.fabricApi ? { fabricApi: target.fabricApi } : {}),
		file: `/downloads/${filename}`,
		bytes: bytes.length,
		sha256,
		...(options.sourceCommit ? { sourceCommit: options.sourceCommit, validation: 'automated' } : {}),
	}
	await mkdir(targetDirectory, { recursive: true })
	await copyFile(source, resolve(targetDirectory, `${filename}.tmp`))
	await rename(resolve(targetDirectory, `${filename}.tmp`), resolve(targetDirectory, filename))
	await writeFile(resolve(targetDirectory, `${filename}.sha256`), `${sha256}  ${filename}\n`)
	await writeFile(resolve(targetDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, '\t')}\n`)
	return manifest
}

export async function packageAllMods(repository = root) {
	return Object.fromEntries(
		await Promise.all(
			Object.keys(prefixes).map(async loader => [
				loader,
				await packageMod(
					resolve(repository, `mod/minemories/${loader}/build/libs`),
					resolve(repository, `build/mod-loaders/${loader}`),
					{ loader }
				),
			])
		)
	)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	if (process.argv[2] === '--all') await packageAllMods()
	else if (process.argv.length > 2) throw new Error('Usage: package-mod.mjs [--all]')
	else await packageMod(resolve(root, 'mod/minemories/neoforge/build/libs'), resolve(root, 'apps/web/public/downloads'))
}
