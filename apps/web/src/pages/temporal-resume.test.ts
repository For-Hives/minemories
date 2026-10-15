// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest'
import { rememberFrame, resumedFrame } from './temporal-resume'

const frame = '11111111-1111-4111-8111-111111111111'
const key = 'minemories-temporal-resume-v1'
beforeEach(() => {
	localStorage.clear()
})
test('resume history retains only the last 32 series, moves updates to the front, and isolates frames by series', () => {
	for (let n = 0; n < 34; n++) rememberFrame(n.toString(16).padStart(64, '0'), frame)
	expect(resumedFrame('0'.repeat(64))).toBeUndefined()
	const series = '2'.padStart(64, '0')
	expect(resumedFrame(series)).toBe(frame)
	rememberFrame(series, '22222222-2222-4222-8222-222222222222')
	const saved = JSON.parse(localStorage.getItem(key) ?? '[]')
	expect(saved).toHaveLength(32)
	expect(saved[0]).toEqual({ series, frame: '22222222-2222-4222-8222-222222222222' })
})
test('corrupt or inaccessible preferences and invalid identifiers cannot prevent playback', () => {
	for (const invalid of ['{', '{}', '[null,{},5,{"series":[],"frame":null}]']) {
		localStorage.setItem(key, invalid)
		expect(resumedFrame('a'.repeat(64))).toBeUndefined()
	}
	localStorage.clear()
	rememberFrame('bad', frame)
	rememberFrame('a'.repeat(64), '../../file')
	expect(localStorage.getItem(key)).toBeNull()
	const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new Error('Disabled')
	})
	expect(() => rememberFrame('a'.repeat(64), frame)).not.toThrow()
	spy.mockRestore()
})
