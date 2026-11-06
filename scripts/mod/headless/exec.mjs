// Runs one process with a timeout, streaming its output to a log file and keeping the last lines in memory.
// The whole process group is killed on timeout (Gradle spawns the game JVM and Xvfb).
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const TAIL_LINES = 200
const KILL_GRACE_MS = 5000

function killGroup(child, signal) {
	try {
		process.kill(-child.pid, signal)
	} catch {
		child.kill(signal)
	}
}

/** → { code, signal, timedOut, tail } ; never rejects for a failing process (spawn errors become code -1). */
export async function execLogged({ command, args, cwd, env, timeoutMs, logFile }) {
	await mkdir(dirname(logFile), { recursive: true })
	const log = createWriteStream(logFile)
	let tail = []
	let partial = ''
	const keep = chunk => {
		log.write(chunk)
		const lines = (partial + chunk.toString('utf8')).split('\n')
		partial = lines.pop()
		tail = [...tail, ...lines].slice(-TAIL_LINES)
	}
	return await new Promise(resolve => {
		let timedOut = false
		let finished = false
		const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
		const timer = setTimeout(() => {
			timedOut = true
			killGroup(child, 'SIGTERM')
			setTimeout(() => killGroup(child, 'SIGKILL'), KILL_GRACE_MS).unref()
		}, timeoutMs)
		const done = (code, signal) => {
			if (finished) return
			finished = true
			clearTimeout(timer)
			if (partial) tail = [...tail, partial].slice(-TAIL_LINES)
			log.end(() => resolve({ code, signal, timedOut, tail: tail.join('\n') }))
		}
		child.stdout.on('data', keep)
		child.stderr.on('data', keep)
		child.on('error', error => {
			keep(Buffer.from(`${error.message}\n`))
			done(-1, null)
		})
		child.on('close', done)
	})
}
