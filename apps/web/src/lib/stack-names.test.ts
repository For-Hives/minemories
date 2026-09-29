import { afterEach, expect, it, vi } from 'vitest'
import { getStackName, setStackName } from './stack-names'

function memoryStorage() {
	const values = new Map<string, string>()
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => {
			values.set(key, value)
		},
	}
}

afterEach(() => vi.unstubAllGlobals())

it('stores trimmed stack names per world and clears them on empty input', () => {
	vi.stubGlobal('localStorage', memoryStorage())
	expect(getStackName('g', 's')).toBeNull()
	setStackName('g', 's', '  Home base  ')
	expect(getStackName('g', 's')).toBe('Home base')
	expect(getStackName('g', 'other')).toBeNull()
	setStackName('g', 's', '   ')
	expect(getStackName('g', 's')).toBeNull()
})

it('truncates long names and survives corrupt or missing storage', () => {
	vi.stubGlobal('localStorage', memoryStorage())
	setStackName('g', 's', 'x'.repeat(200))
	expect(getStackName('g', 's')?.length).toBe(80)

	const corrupt = memoryStorage()
	corrupt.setItem('minemories-stack-names', '{broken')
	vi.stubGlobal('localStorage', corrupt)
	expect(getStackName('g', 's')).toBeNull()
	setStackName('g', 's', 'Fresh')
	expect(getStackName('g', 's')).toBe('Fresh')

	vi.stubGlobal('localStorage', undefined)
	expect(getStackName('g', 's')).toBeNull()
	setStackName('g', 's', 'Nowhere')

	vi.stubGlobal('localStorage', {
		getItem: () => null,
		setItem: () => {
			throw new Error('denied')
		},
	})
	setStackName('g', 's', 'Kept in memory only')
})
