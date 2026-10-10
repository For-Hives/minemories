import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const jarPattern = /^minemories-\d+\.\d+\.\d+(?:[-+][\w.-]+)?\.jar$/
export const downloadFilename = 'minemories-neoforge-mc1.21.1.jar'

export async function packageMod(sourceDirectory, targetDirectory) {
	const jars = (await readdir(sourceDirectory)).filter(
		name => !['-sources.jar', '-javadoc.jar', '-dev.jar'].some(suffix => name.endsWith(suffix)) && jarPattern.test(name)
	)
	if (jars.length !== 1) throw new Error('Expected exactly one built Minemories mod JAR; clean stale builds first.')
	const source = resolve(sourceDirectory, jars[0])
	const bytes = await readFile(source)
	if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50)
		throw new Error('The mod artifact is not a JAR archive.')
	const sha256 = createHash('sha256').update(bytes).digest('hex')
	const manifest = {
		version: jars[0].slice('minemories-'.length, -'.jar'.length),
		minecraft: '1.21.1',
		loader: 'NeoForge',
		loaderVersion: '21.1.248',
		file: `/downloads/${downloadFilename}`,
		bytes: bytes.length,
		sha256,
	}
	await mkdir(targetDirectory, { recursive: true })
	await copyFile(source, resolve(targetDirectory, `${downloadFilename}.tmp`))
	await rename(resolve(targetDirectory, `${downloadFilename}.tmp`), resolve(targetDirectory, downloadFilename))
	await writeFile(resolve(targetDirectory, `${downloadFilename}.sha256`), `${sha256}  ${downloadFilename}\n`)
	await writeFile(resolve(targetDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, '\t')}\n`)
	return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	await packageMod(resolve(root, 'mod/minemories/neoforge/build/libs'), resolve(root, 'apps/web/public/downloads'))
}
