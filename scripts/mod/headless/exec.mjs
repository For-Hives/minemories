// Runs one process with a timeout, streaming its output to a log file and keeping the last lines in memory.
// The whole process group is killed on timeout (Gradle spawns the game JVM and Xvfb).
import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const TAIL_LINES = 200
const SPACES = /\s+/
const GRADLE_DAEMON = /GradleDaemon|gradle-launcher/
const KILL_GRACE_MS = 5000

function killGroup(child, signal) {
	try {
		process.kill(-child.pid, signal)
	} catch {
		child.kill(signal)
	}
}

/**
 * Kills the processes (other than Gradle's own daemons) whose command line mentions `fragment`: a game started by a
 * Gradle daemon is not in the killed process group. Returns the number of processes killed.
 */
export function reapProcesses(fragment, { list = defaultList, kill = process.kill } = {}) {
	let killed = 0
	for (const line of list().split('\n')) {
		const [pid, ...rest] = line.trim().split(SPACES)
		const args = rest.join(' ')
		if (!(args.includes(fragment) && Number.isInteger(Number(pid))) || GRADLE_DAEMON.test(args)) continue
		try {
			kill(Number(pid), 'SIGKILL')
			killed++
		} catch {
			// Already gone.
		}
	}
	return killed
}
function defaultList() {
	return spawnSync('ps', ['-eo', 'pid,args'], { encoding: 'utf8' }).stdout ?? ''
}

/**
 * → { code, signal, timedOut, completed, stuck, tail } ; never rejects for a failing process (spawn errors become
 * code -1). `watch.onLine(line)` may stop the run early: `completed` (the test printed its result, so the process
 * only gets a grace period to exit) or `stuck` (the run is looping or silent for `idleTimeoutMs`).
 */
export async function execLogged({ command, args, cwd, env, timeoutMs, logFile, watch, idleTimeoutMs }) {
	await mkdir(dirname(logFile), { recursive: true })
	const log = createWriteStream(logFile)
	let tail = []
	let partial = ''
	return await new Promise(resolve => {
		let timedOut = false
		let finished = false
		let completed = false
		let stuck = null
		let idleTimer
		const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
		const stop = (graceMs = 0) => {
			setTimeout(() => {
				killGroup(child, 'SIGTERM')
				setTimeout(() => killGroup(child, 'SIGKILL'), KILL_GRACE_MS).unref()
			}, graceMs).unref()
		}
		const armIdle = () => {
			if (!idleTimeoutMs) return
			clearTimeout(idleTimer)
			idleTimer = setTimeout(() => {
				stuck ??= `aucune sortie depuis ${Math.round(idleTimeoutMs / 1000)} s`
				stop()
			}, idleTimeoutMs)
		}
		const judge = line => {
			const verdict = completed || stuck ? null : watch?.onLine(line)
			if (!verdict) return
			if (verdict.stop === 'completed') completed = true
			else stuck = verdict.reason
			stop(verdict.graceMs ?? 0)
		}
		const keep = chunk => {
			log.write(chunk)
			armIdle()
			const lines = (partial + chunk.toString('utf8')).split('\n')
			partial = lines.pop()
			tail = [...tail, ...lines].slice(-TAIL_LINES)
			for (const line of lines) judge(line)
		}
		armIdle()
		const timer = setTimeout(() => {
			timedOut = true
			killGroup(child, 'SIGTERM')
			setTimeout(() => killGroup(child, 'SIGKILL'), KILL_GRACE_MS).unref()
		}, timeoutMs)
		const done = (code, signal) => {
			if (finished) return
			finished = true
			clearTimeout(timer)
			clearTimeout(idleTimer)
			if (partial) tail = [...tail, partial].slice(-TAIL_LINES)
			log.end(() => resolve({ code, signal, timedOut, completed, stuck, tail: tail.join('\n') }))
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
