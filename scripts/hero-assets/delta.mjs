// Byte-exact binary delta of a target against a base (COPY from base / ADD literal bytes). The browser side is
// `applyDelta` in apps/web/src/lib/capture-delta.ts (documented there); this file is the encoder and imports that very
// applier so that every delta is proven to rebuild the exact bytes with the code that ships.
import { applyDelta, DELTA_VERSION } from '../../apps/web/src/lib/capture-delta.ts'

const WINDOW = 12 // bytes hashed to find a match
const MIN_MATCH = 16 // shorter matches are cheaper as literals
const MAX_CANDIDATES = 8 // positions kept per hash

function hashAt(bytes, at) {
	let hash = 0x811c9dc5
	for (let index = 0; index < WINDOW; index++) hash = Math.imul(hash ^ bytes[at + index], 0x01000193)
	return hash >>> 0
}

function pushVarint(out, value) {
	let rest = value
	while (rest >= 128) {
		out.push((rest % 128) | 128)
		rest = Math.floor(rest / 128)
	}
	out.push(rest)
}

/** Hash of every WINDOW-byte run of the base, with the first positions where it occurs. */
function indexBase(base) {
	const index = new Map()
	for (let at = 0; at + WINDOW <= base.length; at++) {
		const key = hashAt(base, at)
		const list = index.get(key)
		if (!list) index.set(key, [at])
		else if (list.length < MAX_CANDIDATES) list.push(at)
	}
	return index
}

function commonLength(base, from, target, at) {
	let length = 0
	while (at + length < target.length && from + length < base.length && target[at + length] === base[from + length])
		length++
	return length
}

/** Longest match of target[at..] in the base; ties go to the candidate closest to where the last copy ended. */
function longestMatch(index, base, target, at, previousEnd) {
	let best = 0
	let bestOffset = -1
	for (const candidate of index.get(hashAt(target, at)) ?? []) {
		const length = commonLength(base, candidate, target, at)
		const closer = Math.abs(candidate - previousEnd) < Math.abs(bestOffset - previousEnd)
		if (length > best || (length === best && closer)) {
			best = length
			bestOffset = candidate
		}
	}
	return { length: best, offset: bestOffset }
}

/** @param {Uint8Array} base @param {Uint8Array} target @returns {Uint8Array} */
export function makeDelta(base, target) {
	const index = indexBase(base)
	const ops = [] // [literalStart, literalLength, copyOffset, copyLength]
	let at = 0
	let literalStart = 0
	let previousEnd = 0
	while (at + WINDOW <= target.length) {
		const match = longestMatch(index, base, target, at, previousEnd)
		if (match.length < MIN_MATCH) {
			at++
			continue
		}
		ops.push([literalStart, at - literalStart, match.offset, match.length])
		at += match.length
		literalStart = at
		previousEnd = match.offset + match.length
	}
	ops.push([literalStart, target.length - literalStart, 0, 0])
	const meta = []
	const literals = []
	pushVarint(meta, ops.length)
	let copyEnd = 0
	for (const [start, add, offset, copy] of ops) {
		pushVarint(meta, add)
		pushVarint(meta, copy)
		if (copy > 0) {
			const move = offset - copyEnd
			pushVarint(meta, move < 0 ? -2 * move - 1 : 2 * move)
			copyEnd = offset + copy
		}
		for (let k = 0; k < add; k++) literals.push(target[start + k])
	}
	return Uint8Array.from([DELTA_VERSION, ...meta, ...literals])
}

/** Delta of `target` against `base`, rebuilt with the shipped applier and compared byte for byte. */
export function makeVerifiedDelta(base, target) {
	const patch = makeDelta(base, target)
	const rebuilt = applyDelta(base, patch)
	if (rebuilt.length !== target.length || Buffer.compare(rebuilt, target) !== 0)
		throw new Error('delta does not rebuild the target')
	return patch
}
