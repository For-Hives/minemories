// Watches the log of an in-game test while it runs. A Minecraft client can hang without ever exiting (a paused
// integrated server, a screen waiting for input, a loading loop) and ForgeGradle can keep running after a successful
// test: the verdict must come from the log and the report, never from waiting for the process to end.
const SUCCESS_LINE = /MINEMORIES-GAMETEST PASSED|MINEMORIES-GLB bytes=/
const VOLATILE = /^\[\d\d:\d\d:\d\d\]\s*|@[0-9a-f]+|\d+/g
const REASON_LENGTH = 100

export const DEFAULT_REPEAT_LIMIT = 120
export const DEFAULT_IDLE_SECONDS = 300
export const COMPLETED_GRACE_MS = 15_000

/**
 * Returns `{ onLine(line) }`: null while the run looks healthy, `{ stop: 'completed', graceMs }` once the test
 * printed its result, `{ stop: 'stuck', reason }` when the same line repeats `repeatLimit` times in a row (the world
 * loading loop of a paused client prints one every second).
 */
export function createWatchdog({ repeatLimit = DEFAULT_REPEAT_LIMIT, graceMs = COMPLETED_GRACE_MS } = {}) {
	let previous = ''
	let repeats = 0
	return {
		onLine(line) {
			if (SUCCESS_LINE.test(line)) return { stop: 'completed', graceMs }
			const key = line.replace(VOLATILE, '#').trim()
			if (key && key === previous) repeats++
			else {
				previous = key
				repeats = 1
			}
			if (repeats >= repeatLimit) {
				return { stop: 'stuck', reason: `the same line repeated ${repeats} times: ${key.slice(0, REASON_LENGTH)}` }
			}
			return null
		},
	}
}
