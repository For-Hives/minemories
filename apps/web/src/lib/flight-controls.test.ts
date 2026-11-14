import { expect, test } from 'vitest'
import {
	actionFor,
	CONTROLS_STORAGE_KEY,
	defaultControls,
	guessLayout,
	keyLabel,
	loadControls,
	parseControls,
	presetBindings,
	rebind,
	reservedKey,
	resolveLayout,
	riskyKey,
	saveControls,
} from './flight-controls'

test('keys are physical positions: AZERTY and QWERTZ only change the labels', () => {
	expect(actionFor(presetBindings.viewer, 'KeyW')).toBe('forward')
	expect(keyLabel('KeyW', 'qwerty')).toBe('W')
	expect(keyLabel('KeyW', 'azerty')).toBe('Z')
	expect(keyLabel('KeyA', 'azerty')).toBe('Q')
	expect(keyLabel('KeyQ', 'azerty')).toBe('A')
	expect(keyLabel('Semicolon', 'azerty')).toBe('M')
	expect(keyLabel('KeyZ', 'qwertz')).toBe('Y')
	expect(keyLabel('KeyW', 'qwertz')).toBe('W')
	// The browser's own map wins when it has one.
	expect(keyLabel('KeyW', 'qwerty', new Map([['KeyW', 'z']]))).toBe('Z')
	expect(keyLabel('KeyX', 'qwerty', new Map())).toBe('X')
	expect(keyLabel('ShiftLeft', 'qwerty')).toBe('Left Shift')
	expect(keyLabel('ArrowUp', 'azerty')).toBe('↑')
	expect(keyLabel('Digit4', 'qwerty')).toBe('4')
	expect(keyLabel('Numpad8', 'qwerty')).toBe('Num 8')
	expect(keyLabel('BracketLeft', 'qwerty')).toBe('BracketLeft')
	expect(actionFor(presetBindings.viewer, 'KeyP')).toBeUndefined()
})

test('the layout is guessed from the browser language', () => {
	expect(guessLayout(['fr-FR', 'en'])).toBe('azerty')
	expect(guessLayout(['fr'])).toBe('azerty')
	expect(guessLayout(['fr-BE'])).toBe('azerty')
	expect(guessLayout(['nl-BE'])).toBe('azerty')
	expect(guessLayout(['fr-CA'])).toBe('qwerty')
	expect(guessLayout(['fr-CH'])).toBe('qwertz')
	expect(guessLayout(['de-DE'])).toBe('qwertz')
	expect(guessLayout(['cs'])).toBe('qwertz')
	expect(guessLayout(['en-US'])).toBe('qwerty')
	expect(guessLayout([])).toBe('qwerty')
	expect(resolveLayout('auto', ['fr'])).toBe('azerty')
	expect(resolveLayout('qwerty', ['fr'])).toBe('qwerty')
})

test('a key bound to one action leaves the action it drove before', () => {
	const next = rebind(presetBindings.viewer, 'down', 0, 'ShiftLeft')
	expect(next.down).toEqual(['ShiftLeft', 'KeyQ'])
	expect(next.sprint).toEqual([null, 'ShiftRight'])
	expect(presetBindings.viewer.sprint).toEqual(['ShiftLeft', 'ShiftRight'])
	const cleared = rebind(next, 'down', 1, null)
	expect(cleared.down).toEqual(['ShiftLeft', null])
	expect(cleared.forward).toEqual(['KeyW', 'ArrowUp'])
})

test('Ctrl, Meta and Alt are flagged; Escape and Tab cannot be bound', () => {
	expect(riskyKey('ControlLeft')).toBe(true)
	expect(riskyKey('MetaRight')).toBe(true)
	expect(riskyKey('AltLeft')).toBe(true)
	expect(riskyKey('KeyR')).toBe(false)
	expect(reservedKey('Escape')).toBe(true)
	expect(reservedKey('Tab')).toBe(true)
	expect(reservedKey('')).toBe(true)
	expect(reservedKey('KeyR')).toBe(false)
})

test('stored settings are read back safely: anything invalid takes its default', () => {
	expect(parseControls(null)).toEqual(defaultControls)
	expect(parseControls('{oops')).toEqual(defaultControls)
	expect(parseControls('42')).toEqual(defaultControls)
	const stored = parseControls(
		JSON.stringify({
			layout: 'azerty',
			bindings: {
				up: ['KeyR', null],
				down: ['Escape', null],
				sprint: ['KeyX'],
				nope: ['KeyY', null],
				left: [null, 'x'.repeat(40)],
			},
			sensitivity: 2,
			touchSensitivity: Number.NaN,
			invertY: true,
			fovEffects: false,
		})
	)
	expect(stored.layout).toBe('azerty')
	expect(stored.bindings.up).toEqual(['KeyR', null])
	expect(stored.bindings.down).toEqual(presetBindings.viewer.down)
	expect(stored.bindings.sprint).toEqual(presetBindings.viewer.sprint)
	expect(stored.bindings.left).toEqual(presetBindings.viewer.left)
	expect(stored.sensitivity).toBe(1)
	expect(stored.touchSensitivity).toBe(0.5)
	expect(stored.invertY).toBe(true)
	expect(stored.fovEffects).toBe(false)
	const odd = parseControls(JSON.stringify({ layout: 'dvorak', bindings: 'no', invertY: 'yes', fovEffects: 1 }))
	expect(odd).toEqual(defaultControls)
})

test('settings survive in storage, and blocked storage falls back to defaults', () => {
	const values = new Map<string, string>()
	const storage = {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => void values.set(key, value),
	}
	const mine = { ...defaultControls, sensitivity: 0.8 }
	saveControls(storage, mine)
	expect(values.has(CONTROLS_STORAGE_KEY)).toBe(true)
	expect(loadControls(storage)).toEqual(mine)
	expect(loadControls(null)).toEqual(defaultControls)
	const blocked = {
		getItem: () => {
			throw new Error('SecurityError')
		},
		setItem: () => {
			throw new Error('QuotaExceededError')
		},
	}
	expect(loadControls(blocked)).toEqual(defaultControls)
	expect(() => saveControls(blocked, mine)).not.toThrow()
	saveControls(null, mine)
})
