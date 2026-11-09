import { afterEach, expect, it, vi } from 'vitest'
import {
	clearAllDrafts,
	clearDraft,
	DRAFT_TTL_MS,
	draftId,
	isDraftString,
	MAX_DRAFT_LENGTH,
	MAX_DRAFTS,
	readDraft,
	sameDraftValue,
	writeDraft,
} from './form-drafts'

const KEY = 'minemories-form-drafts'

function memoryStorage() {
	const values = new Map<string, string>()
	return {
		values,
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value)
		},
		removeItem: (key: string) => {
			values.delete(key)
		},
	}
}

function stored(storage: ReturnType<typeof memoryStorage>) {
	return JSON.parse(storage.values.get(KEY) ?? '{}') as Record<string, { value: unknown; savedAt: number }>
}

afterEach(() => vi.unstubAllGlobals())

const id = draftId('area-name', 'owner', 'world/area')

it('builds distinct ids per kind, owner and item, even when parts contain separators', () => {
	expect(draftId('a', 'b:c', 'd')).not.toBe(draftId('a', 'b', 'c:d'))
	expect(draftId('a', 'o', 'x')).not.toBe(draftId('b', 'o', 'x'))
})

it('compares JSON values by content', () => {
	expect(sameDraftValue({ title: 'A', category: 'build' }, { title: 'A', category: 'build' })).toBe(true)
	expect(sameDraftValue('A', 'B')).toBe(false)
	expect(isDraftString('x')).toBe(true)
	expect(isDraftString(1)).toBe(false)
})

it('stores, restores and clears a draft; a value equal to the saved one removes it', () => {
	const storage = memoryStorage()
	vi.stubGlobal('localStorage', storage)
	expect(readDraft(id, isDraftString, 1000)).toBeNull()
	expect(writeDraft(id, 'New name', 'Old name', 1000)).toBe(true)
	expect(readDraft(id, isDraftString, 2000)).toBe('New name')
	expect(stored(storage)[id]).toEqual({ value: 'New name', savedAt: 1000 })

	expect(writeDraft(id, 'Old name', 'Old name', 3000)).toBe(false)
	expect(readDraft(id, isDraftString, 3000)).toBeNull()
	expect(storage.values.has(KEY)).toBe(false)

	writeDraft(id, 'Again', 'Old name', 4000)
	writeDraft(draftId('server-name', 'owner', 'world'), 'Server', 'World', 4000)
	clearDraft(id, 5000)
	expect(readDraft(id, isDraftString, 5000)).toBeNull()
	expect(Object.keys(stored(storage))).toHaveLength(1)
	clearDraft(id, 5000)
	expect(Object.keys(stored(storage))).toHaveLength(1)
})

it('forgets every draft at once, for sign-out', () => {
	const storage = memoryStorage()
	vi.stubGlobal('localStorage', storage)
	writeDraft(id, 'Private name', 'Saved', 1000)
	writeDraft(draftId('publication', 'other', 'memory'), { title: 'T' }, null, 1000)
	storage.setItem('unrelated', 'kept')
	clearAllDrafts()
	expect(storage.values.has(KEY)).toBe(false)
	expect(readDraft(id, isDraftString, 1000)).toBeNull()
	expect(storage.getItem('unrelated')).toBe('kept')
})

it('keeps object drafts and drops a draft whose shape is no longer valid', () => {
	const storage = memoryStorage()
	vi.stubGlobal('localStorage', storage)
	const form = { title: 'Village', description: '', category: 'build' }
	writeDraft(id, form, null, 1000)
	const isForm = (value: unknown): value is typeof form =>
		typeof value === 'object' && value !== null && 'title' in value
	expect(readDraft(id, isForm, 1000)).toEqual(form)
	expect(readDraft(id, isDraftString, 1000)).toBeNull()
	expect(storage.values.has(KEY)).toBe(false)
})

it('expires drafts after 30 days and ignores garbage entries', () => {
	const storage = memoryStorage()
	vi.stubGlobal('localStorage', storage)
	writeDraft(id, 'Old', 'Saved', 1000)
	expect(readDraft(id, isDraftString, 1000 + DRAFT_TTL_MS - 1)).toBe('Old')
	expect(readDraft(id, isDraftString, 1000 + DRAFT_TTL_MS)).toBeNull()

	storage.setItem(
		KEY,
		JSON.stringify({
			__proto__: { value: 'proto', savedAt: 10 },
			missing: { savedAt: 10 },
			nan: { value: 'x', savedAt: 'soon' },
			null: null,
			[id]: { value: 'Kept', savedAt: 10 },
		})
	)
	expect(readDraft(id, isDraftString, 20)).toBe('Kept')
	expect(readDraft('missing', isDraftString, 20)).toBeNull()
	expect(readDraft('__proto__', isDraftString, 20)).toBeNull()

	for (const garbage of ['{broken', '[]', 'null', '"text"']) {
		storage.setItem(KEY, garbage)
		expect(readDraft(id, isDraftString, 20)).toBeNull()
	}
	expect(writeDraft(id, 'Fresh', 'Saved', 30)).toBe(true)
	expect(stored(storage)).toEqual({ [id]: { value: 'Fresh', savedAt: 30 } })
})

it('caps stored drafts by count and size, dropping the oldest first', () => {
	const storage = memoryStorage()
	vi.stubGlobal('localStorage', storage)
	for (let index = 0; index <= MAX_DRAFTS; index++) writeDraft(`item-${index}`, `value-${index}`, '', 1000 + index)
	const ids = Object.keys(stored(storage))
	expect(ids).toHaveLength(MAX_DRAFTS)
	expect(ids).not.toContain('item-0')
	expect(ids).toContain(`item-${MAX_DRAFTS}`)

	expect(writeDraft('huge', 'x'.repeat(MAX_DRAFT_LENGTH), '', 5000)).toBe(false)
	expect(readDraft('huge', isDraftString, 5000)).toBeNull()
})

it('survives missing or refusing storage', () => {
	vi.stubGlobal('localStorage', undefined)
	expect(writeDraft(id, 'Nowhere', 'Saved', 1)).toBe(true)
	expect(readDraft(id, isDraftString, 1)).toBeNull()
	clearDraft(id, 1)

	vi.stubGlobal('localStorage', {
		getItem: () => {
			throw new Error('denied')
		},
		setItem: () => {
			throw new Error('quota')
		},
		removeItem: () => {
			throw new Error('denied')
		},
	})
	expect(writeDraft(id, 'Refused', 'Saved', 1)).toBe(true)
	expect(readDraft(id, isDraftString, 1)).toBeNull()
	clearAllDrafts()

	// A browser that blocks site data throws as soon as localStorage is read.
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		get() {
			throw new Error('blocked')
		},
	})
	expect(readDraft(id, isDraftString, 1)).toBeNull()
	expect(writeDraft(id, 'Blocked', 'Saved', 1)).toBe(true)
	clearAllDrafts()
})
