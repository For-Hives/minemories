import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { filenameFor, readTargets } from './release-utils.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const jarPattern = /^minemories-\d+\.\d+\.\d+(?:[-+][\w.-]+)?\.jar$/
export const downloadFilename = 'minemories-neoforge-mc1.21.1.jar'

export async function packageMod(sourceDirectory, targetDirectory, options = {}) {
	const target = options.target ?? (await readTargets()).find(item => filenameFor(item) === downloadFilename)
	if (!target) throw new Error('Missing legacy download target.')
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
	const version = jars[0].slice('minemories-'.length, -'.jar'.length)
	if (options.version && version !== options.version)
		throw new Error('The built JAR version differs from the planned release.')
	const manifest = {
		version,
		minecraft: target.minecraft,
		loader: target.name,
		loaderVersion: target.loaderVersion,
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await packageMod(resolve(root, 'mod/minemories/neoforge/build/libs'), resolve(root, 'apps/web/public/downloads'))
}
