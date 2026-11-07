import { afterAll, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectJar } from './mod-jar'
import { makeJar } from './test-support/jar-fixture'

const directory = mkdtempSync(join(tmpdir(), 'minemories-mod-jar-'))
afterAll(() => rmSync(directory, { recursive: true, force: true }))

let counter = 0
async function verdict(bytes: Buffer) {
	counter += 1
	const path = join(directory, `file-${counter}.jar`)
	writeFileSync(path, bytes)
	return inspectJar(path)
}

test('a JAR with a class is accepted, even behind padding', async () => {
	expect(await verdict(makeJar())).toBe('ok')
	expect(await verdict(makeJar(['META-INF/', 'a/b.txt', 'a/B.class'], 5000))).toBe('ok')
})

test('a JAR without any class is rejected', async () => {
	expect(await verdict(makeJar(['fabric.mod.json', 'assets/x.png']))).toBe('no_classes')
	expect(await verdict(makeJar([]))).toBe('not_zip')
})

test('a file that is not a ZIP archive is rejected', async () => {
	expect(await verdict(Buffer.from('PK'))).toBe('not_zip')
	expect(await verdict(Buffer.from('not a zip at all, but long enough to hold a header record'))).toBe('not_zip')
	const noEnd = makeJar().subarray(0, 60)
	expect(await verdict(noEnd)).toBe('not_zip')
})

test('a central directory outside the file or in zip64 is rejected', async () => {
	const outside = Buffer.from(makeJar())
	outside.writeUInt32LE(0x7fffffff, outside.length - 22 + 16)
	expect(await verdict(outside)).toBe('not_zip')
	const zip64 = Buffer.from(makeJar())
	zip64.writeUInt32LE(0xffffffff, zip64.length - 22 + 12)
	expect(await verdict(zip64)).toBe('not_zip')
	const many = Buffer.from(makeJar())
	many.writeUInt16LE(0xffff, many.length - 22 + 10)
	expect(await verdict(many)).toBe('not_zip')
})
