import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { acquireLock, pidAlive, withLock } from './lock.mjs'

const tmp = async () => join(await mkdtemp(join(tmpdir(), 'mod-lock-')), 'sub', 'build.lock')

test('a second acquisition fails while the owner is alive, then succeeds after release', async () => {
	const path = await tmp()
	const release = await acquireLock(path, { label: 'one' })
	await assert.rejects(acquireLock(path, { label: 'two' }), /already running \(one/)
	await release()
	assert.equal(existsSync(path), false)
	await (await acquireLock(path))()
})

test('a stale lock (dead owner) is taken over', async () => {
	const path = await tmp()
	await await acquireLock(path, { pid: 999999 })
	const release = await acquireLock(path, { alive: () => false, pid: 1234 })
	assert.equal(JSON.parse(await readFile(path, 'utf8')).pid, 1234)
	await release()
})

test('an unreadable lock file counts as stale and a foreign host is not trusted', async () => {
	const path = await tmp()
	await await acquireLock(path)
	await writeFile(path, 'not json')
	await (await acquireLock(path))()
	await writeFile(path, JSON.stringify({ pid: process.pid, host: `${hostname()}-other`, label: 'x', since: '' }))
	await (await acquireLock(path))()
})

test('withLock releases on error and pidAlive reflects the process table', async () => {
	const path = await tmp()
	await assert.rejects(
		withLock(path, () => {
			throw new Error('boom')
		}),
		/boom/
	)
	assert.equal(existsSync(path), false)
	assert.equal(await withLock(path, () => 'ok'), 'ok')
	assert.equal(pidAlive(process.pid), true)
	assert.equal(pidAlive(2 ** 22 + 12345), false)
})
