// One Gradle build at a time per machine: a lock file holding the owner's pid, ignored once that process is gone.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { dirname } from 'node:path'

export function pidAlive(pid) {
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		return error.code === 'EPERM'
	}
}

async function readOwner(path) {
	try {
		return JSON.parse(await readFile(path, 'utf8'))
	} catch {
		return null
	}
}

/** Takes the lock or throws with the owner's description. Returns an async `release`. */
export async function acquireLock(path, { label = 'bun mod', alive = pidAlive, pid = process.pid } = {}) {
	await mkdir(dirname(path), { recursive: true })
	const owner = { pid, label, host: hostname(), since: new Date().toISOString() }
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			await writeFile(path, JSON.stringify(owner), { flag: 'wx' })
			return () => rm(path, { force: true })
		} catch (error) {
			if (error.code !== 'EEXIST') throw error
		}
		const current = await readOwner(path)
		if (current && alive(current.pid) && current.host === owner.host)
			throw new Error(`Un build est déjà en cours (${current.label}, pid ${current.pid}, depuis ${current.since}).`)
		await rm(path, { force: true }) // stale: owner crashed or lock unreadable
	}
	throw new Error(`Impossible de prendre le verrou ${path}.`)
}

export async function withLock(path, fn, options) {
	const release = await acquireLock(path, options)
	try {
		return await fn()
	} finally {
		await release()
	}
}
