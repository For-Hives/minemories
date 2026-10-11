import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { downloadFilename } from './package-mod.mjs'

const sha256Pattern = /^[a-f0-9]{64}$/
const versionPattern = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/

async function hashJar(path) {
	const file = await open(path, 'r')
	try {
		const header = Buffer.alloc(4)
		const { bytesRead } = await file.read(header, 0, header.length, 0)
		if (bytesRead !== 4 || header.readUInt32LE(0) !== 0x04034b50)
			throw new Error('The downloaded mod is not a JAR archive.')
	} finally {
		await file.close()
	}
	const hash = createHash('sha256')
	let bytes = 0
	for await (const chunk of createReadStream(path)) {
		bytes += chunk.length
		hash.update(chunk)
	}
	return { bytes, sha256: hash.digest('hex') }
}

export async function verifyModArtifact(directory, expectedSha256) {
	if (typeof expectedSha256 !== 'string' || !sha256Pattern.test(expectedSha256))
		throw new Error('The original build SHA-256 is required.')
	const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'))
	if (
		manifest === null ||
		typeof manifest !== 'object' ||
		Array.isArray(manifest) ||
		typeof manifest.version !== 'string' ||
		!versionPattern.test(manifest.version) ||
		manifest.minecraft !== '1.21.1' ||
		manifest.loader !== 'NeoForge' ||
		manifest.loaderVersion !== '21.1.248' ||
		manifest.file !== `/downloads/${downloadFilename}` ||
		!Number.isSafeInteger(manifest.bytes) ||
		manifest.bytes < 4 ||
		manifest.sha256 !== expectedSha256
	)
		throw new Error('The downloaded manifest does not match the tested mod build.')
	const checksum = await readFile(resolve(directory, `${downloadFilename}.sha256`), 'utf8')
	if (checksum !== `${expectedSha256}  ${downloadFilename}\n`)
		throw new Error('The downloaded checksum file does not match the tested mod build.')
	const actual = await hashJar(resolve(directory, downloadFilename))
	if (actual.bytes !== manifest.bytes || actual.sha256 !== expectedSha256)
		throw new Error('The downloaded JAR differs from the tested mod build.')
	return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const [directory, expectedSha256] = process.argv.slice(2)
	if (!directory) throw new Error('Usage: verify-mod-artifact.mjs <directory> <build-sha256>')
	await verifyModArtifact(directory, expectedSha256)
}
