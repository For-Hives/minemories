// Pure helpers: read the statistics of the GLB produced by the in-game capture test and compare them to thresholds.
// The test itself (mod/shared/gametest-common GlbReport) already checks the expected materials and alpha modes and
// writes `<user.home>/export/summary.txt`; the thresholds here catch an empty or truncated capture on top of that.

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK = 0x4e4f534a
const SUMMARY_LINE = /bytes=(\d+) meshes=(\d+) materials=(\d+) images=(\d+) nodes=(\d+)/
const ERROR_LINE = /(?:Error|Exception)\b/
const PASSED_MARKER = 'MINEMORIES-GAMETEST PASSED'
const FAILED_MARKER = 'MINEMORIES-GAMETEST FAILED'
const COUNT_KEYS = ['meshes', 'materials', 'images', 'nodes']

/** Statistics from the binary GLB (little endian header, first chunk is JSON). Throws on a malformed file. */
export function parseGlbStats(buffer) {
	if (buffer.length < 20 || buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Invalid GLB file (magic)')
	const jsonLength = buffer.readUInt32LE(12)
	if (buffer.readUInt32LE(16) !== JSON_CHUNK || 20 + jsonLength > buffer.length) {
		throw new Error('Invalid GLB file (JSON chunk)')
	}
	const root = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'))
	const stats = { bytes: buffer.length }
	for (const key of COUNT_KEYS) stats[key] = Array.isArray(root[key]) ? root[key].length : 0
	return stats
}

/** Statistics from the first line of summary.txt written by GlbReport. Returns null when the line is absent. */
export function parseSummary(text) {
	const match = SUMMARY_LINE.exec(String(text ?? ''))
	if (!match) return null
	const [bytes, meshes, materials, images, nodes] = match.slice(1).map(Number)
	return { bytes, meshes, materials, images, nodes }
}

/** What the game log says about the test run. */
export function parseLogMarkers(log) {
	const text = String(log ?? '')
	return { passed: text.includes(PASSED_MARKER), failed: text.includes(FAILED_MARKER) }
}

// What the game says when a resource of the mod is missing: the purple and black texture, a lost model or translation.
const RESOURCE_PROBLEM = /(?:Failed to load texture|Missing (?:texture|sprite|model)|Unable to load model|Unable to parse)[^\n]*\bminemories:[^\n]*/gi

/** Lines of the game log that report a missing or unreadable resource of the mod (deduplicated). */
export function resourceProblems(log) {
	return [...new Set(String(log ?? '').match(RESOURCE_PROBLEM) ?? [])].map(line => line.trim().slice(0, 200))
}

/** The most useful line of an in-game failure: the AssertionError / Exception line after the FAILED marker. */
export function failureMessage(log) {
	const lines = String(log ?? '').split('\n')
	const marker = lines.findLastIndex(line => line.includes(FAILED_MARKER))
	if (marker < 0) return null
	const detail = lines.slice(marker, marker + 6).find(line => ERROR_LINE.test(line))
	return (detail ?? lines[marker]).trim().slice(0, 300)
}

/** Thresholds for a target: defaults overridden by the per-id entry. */
export function thresholdsFor(file, targetId) {
	return { ...(file?.default ?? {}), ...(file?.targets?.[targetId] ?? {}) }
}

/** Human readable violations; empty when the report meets every threshold. */
export function evaluateStats(stats, thresholds) {
	const problems = []
	if (typeof thresholds.bytes === 'number' && stats.bytes < thresholds.bytes) {
		problems.push(`GLB too small: ${stats.bytes} bytes (minimum ${thresholds.bytes})`)
	}
	if (typeof thresholds.maxBytes === 'number' && stats.bytes > thresholds.maxBytes) {
		problems.push(`GLB too large: ${stats.bytes} bytes (maximum ${thresholds.maxBytes})`)
	}
	for (const key of COUNT_KEYS) {
		if (typeof thresholds[key] === 'number' && stats[key] < thresholds[key]) {
			problems.push(`${key}: ${stats[key]} (minimum ${thresholds[key]})`)
		}
	}
	return problems
}
