/**
 * Unsaved form values kept in this browser, so a refresh, a closed dialog or a tab switch never loses what was typed.
 * Every draft lives under one storage key, scoped by form kind, owner and item; it expires after 30 days.
 */
const STORAGE_KEY = 'minemories-form-drafts'
export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** Oldest drafts are dropped beyond this count, so the store stays small. */
export const MAX_DRAFTS = 40
/** A value whose JSON is longer than this is kept on screen only, never stored. */
export const MAX_DRAFT_LENGTH = 4000

interface Entry {
	value: unknown
	savedAt: number
}
type Store = Record<string, Entry>

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEntry(value: unknown): value is Entry {
	return isRecord(value) && 'value' in value && typeof value.savedAt === 'number' && Number.isFinite(value.savedAt)
}

function storage(): Storage | null {
	try {
		return globalThis.localStorage ?? null
	} catch {
		return null
	}
}

function readRaw(): string | null {
	try {
		return storage()?.getItem(STORAGE_KEY) ?? null
	} catch {
		return null
	}
}

function parse(raw: string): unknown {
	try {
		return JSON.parse(raw)
	} catch {
		return null
	}
}

/** Valid, unexpired entries; garbage and stale drafts are ignored (and dropped on the next write). */
function readStore(now: number): Store {
	// A null prototype keeps ids such as "__proto__" ordinary keys.
	const store: Store = Object.create(null)
	const raw = readRaw()
	const parsed = raw ? parse(raw) : null
	if (!isRecord(parsed)) return store
	for (const [id, entry] of Object.entries(parsed))
		if (isEntry(entry) && now - entry.savedAt < DRAFT_TTL_MS) store[id] = entry
	return store
}

function writeStore(store: Store): void {
	try {
		const target = storage()
		if (!target) return
		if (Object.keys(store).length === 0) target.removeItem(STORAGE_KEY)
		else target.setItem(STORAGE_KEY, JSON.stringify(store))
	} catch {
		// Private browsing or a full quota can refuse storage; the draft then lasts for this view only.
	}
}

/** One unambiguous id per form kind, owner and item. */
export function draftId(kind: string, owner: string, item: string): string {
	return JSON.stringify([kind, owner, item])
}

/** Draft values are plain JSON: two values are the same when they serialize the same. */
export function sameDraftValue(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b)
}

/** The stored draft, or null when there is none, it expired, or it no longer has the expected shape (then dropped). */
export function readDraft<T>(id: string, isValid: (value: unknown) => value is T, now = Date.now()): T | null {
	const store = readStore(now)
	const entry = store[id]
	if (!entry) return null
	if (isValid(entry.value)) return entry.value
	delete store[id]
	writeStore(store)
	return null
}

/**
 * Stores what is being typed. A value equal to the saved one is not a draft: it removes the stored draft instead.
 * Returns whether the draft is now stored.
 */
export function writeDraft(id: string, value: unknown, saved: unknown, now = Date.now()): boolean {
	const store = readStore(now)
	delete store[id]
	const keep = !sameDraftValue(value, saved) && String(JSON.stringify(value)).length <= MAX_DRAFT_LENGTH
	if (keep) {
		store[id] = { value, savedAt: now }
		const oldest = Object.entries(store).sort(([, a], [, b]) => a.savedAt - b.savedAt)
		for (const [old] of oldest.slice(0, Math.max(0, oldest.length - MAX_DRAFTS))) delete store[old]
	}
	writeStore(store)
	return keep
}

export function clearDraft(id: string, now = Date.now()): void {
	const store = readStore(now)
	if (!(id in store)) return
	delete store[id]
	writeStore(store)
}

/** Forgets every draft of every account in this browser, e.g. on sign-out on a shared computer. */
export function clearAllDrafts(): void {
	try {
		storage()?.removeItem(STORAGE_KEY)
	} catch {
		// Storage that refuses access holds nothing this view could have written.
	}
}

export function isDraftString(value: unknown): value is string {
	return typeof value === 'string'
}
