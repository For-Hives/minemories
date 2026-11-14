// Flight key bindings and settings. Keys are bound by physical position (KeyboardEvent.code), as Minecraft binds
// them: the key under the left middle finger moves forward on QWERTY (W), AZERTY (Z) and QWERTZ (W) alike. The
// keyboard layout only changes the labels shown.

export const flightActions = ['forward', 'back', 'left', 'right', 'up', 'down', 'sprint'] as const
export type FlightAction = (typeof flightActions)[number]
/** Two keys per action, the second optional. */
export type Bindings = Record<FlightAction, [string | null, string | null]>

export const keyboardLayouts = ['auto', 'qwerty', 'azerty', 'qwertz'] as const
export type KeyboardLayout = (typeof keyboardLayouts)[number]
export type ResolvedLayout = Exclude<KeyboardLayout, 'auto'>

export const controlPresets = ['viewer', 'minecraft'] as const
export type ControlPreset = (typeof controlPresets)[number]

/**
 * `viewer`: Shift sprints (as the viewer always did), Space/E climb, C/Q descend. `minecraft`: Minecraft Java's
 * keys, except sprint on R: Ctrl+W would close the browser tab, so a browser cannot use Ctrl to sprint.
 */
export const presetBindings: Record<ControlPreset, Bindings> = {
	viewer: {
		forward: ['KeyW', 'ArrowUp'],
		back: ['KeyS', 'ArrowDown'],
		left: ['KeyA', 'ArrowLeft'],
		right: ['KeyD', 'ArrowRight'],
		up: ['Space', 'KeyE'],
		down: ['KeyC', 'KeyQ'],
		sprint: ['ShiftLeft', 'ShiftRight'],
	},
	minecraft: {
		forward: ['KeyW', null],
		back: ['KeyS', null],
		left: ['KeyA', null],
		right: ['KeyD', null],
		up: ['Space', null],
		down: ['ShiftLeft', null],
		sprint: ['KeyR', null],
	},
}

export type ControlSettings = {
	layout: KeyboardLayout
	bindings: Bindings
	/** Minecraft's mouse sensitivity, 0 to 1 (0.5 by default). */
	sensitivity: number
	/** Same scale for dragging a finger on a touch screen. */
	touchSensitivity: number
	invertY: boolean
	/** Wider view while flying and sprinting, as Minecraft's FOV effects. */
	fovEffects: boolean
}

export const defaultControls: ControlSettings = {
	layout: 'auto',
	bindings: presetBindings.viewer,
	sensitivity: 0.5,
	touchSensitivity: 0.5,
	invertY: false,
	fovEffects: true,
}

const AZERTY_LANGUAGE = /^fr(-(fr|be|lu|mc))?$|^nl-be$/
const QWERTZ_LANGUAGE = /^(de|fr-ch|cs|sk|hu|sl|hr)/
const LETTER_KEY = /^Key[A-Z]$/
const DIGIT_KEY = /^Digit\d$/
const NUMPAD_KEY = /^Numpad\d$/
const MODIFIER_KEY = /^(Control|Meta|Alt)/

/** The layout a browser language most likely types on. */
export function guessLayout(languages: readonly string[]): ResolvedLayout {
	const language = (languages[0] ?? '').toLowerCase()
	if (AZERTY_LANGUAGE.test(language)) return 'azerty'
	if (QWERTZ_LANGUAGE.test(language)) return 'qwertz'
	return 'qwerty'
}

export function resolveLayout(layout: KeyboardLayout, languages: readonly string[]): ResolvedLayout {
	return layout === 'auto' ? guessLayout(languages) : layout
}

/** Characters that differ from QWERTY on a layout, by physical key. */
const layoutLetters: Record<ResolvedLayout, Record<string, string>> = {
	qwerty: {},
	azerty: { KeyQ: 'A', KeyA: 'Q', KeyW: 'Z', KeyZ: 'W', Semicolon: 'M', KeyM: ',' },
	qwertz: { KeyY: 'Z', KeyZ: 'Y' },
}

const namedKeys: Record<string, string> = {
	Space: 'Space',
	ShiftLeft: 'Left Shift',
	ShiftRight: 'Right Shift',
	ControlLeft: 'Left Ctrl',
	ControlRight: 'Right Ctrl',
	AltLeft: 'Left Alt',
	AltRight: 'Right Alt',
	MetaLeft: 'Left Meta',
	MetaRight: 'Right Meta',
	ArrowUp: '↑',
	ArrowDown: '↓',
	ArrowLeft: '←',
	ArrowRight: '→',
	CapsLock: 'Caps Lock',
	Enter: 'Enter',
	Backspace: 'Backspace',
}

/**
 * What a physical key shows: the browser's own layout map when it has one (Chromium), else the chosen layout's
 * letter, else a readable name of the code.
 */
export function keyLabel(code: string, layout: ResolvedLayout, layoutMap?: ReadonlyMap<string, string>): string {
	const mapped = layoutMap?.get(code)
	if (mapped) return mapped.toUpperCase()
	const letter = layoutLetters[layout][code]
	if (letter) return letter
	if (namedKeys[code]) return namedKeys[code]
	if (LETTER_KEY.test(code)) return code.slice(3)
	if (DIGIT_KEY.test(code)) return code.slice(5)
	if (NUMPAD_KEY.test(code)) return `Num ${code.slice(6)}`
	return code
}

/** The flight action a key drives, if any. */
export function actionFor(bindings: Bindings, code: string): FlightAction | undefined {
	return flightActions.find(action => bindings[action].includes(code))
}

/** Keys a browser keeps for itself (Ctrl+W closes the tab) or for leaving the view. */
export function riskyKey(code: string): boolean {
	return MODIFIER_KEY.test(code)
}

/** Keys that can never be bound: they release the mouse or move the focus. */
export function reservedKey(code: string): boolean {
	return code === 'Escape' || code === 'Tab' || code === ''
}

/** Binds `code` to one slot of an action; the key leaves any other action it drove, so no key does two things. */
export function rebind(bindings: Bindings, action: FlightAction, slot: 0 | 1, code: string | null): Bindings {
	const next = Object.fromEntries(
		flightActions.map(name => [
			name,
			bindings[name].map(bound => (code !== null && bound === code ? null : bound)) as [string | null, string | null],
		])
	) as Bindings
	next[action][slot] = code
	return next
}

const isAction = (value: unknown): value is FlightAction => flightActions.includes(value as FlightAction)
const isCode = (value: unknown): value is string | null =>
	value === null || (typeof value === 'string' && value.length > 0 && value.length < 32 && !reservedKey(value))
const unit = (value: unknown, fallback: number) =>
	typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback

function readBindings(value: unknown): Bindings {
	const bindings = { ...presetBindings.viewer }
	if (typeof value !== 'object' || value === null) return bindings
	for (const [action, keys] of Object.entries(value)) {
		if (!(isAction(action) && Array.isArray(keys)) || keys.length !== 2 || !keys.every(isCode)) continue
		const [first, second] = keys as [string | null, string | null]
		bindings[action] = [first, second]
	}
	return bindings
}

/** Settings read back from storage: anything missing or invalid takes its default. */
export function parseControls(text: string | null): ControlSettings {
	let value: unknown
	try {
		value = JSON.parse(text ?? 'null')
	} catch {
		return defaultControls
	}
	if (typeof value !== 'object' || value === null) return defaultControls
	const stored = value as Record<string, unknown>
	return {
		layout: keyboardLayouts.includes(stored.layout as KeyboardLayout)
			? (stored.layout as KeyboardLayout)
			: defaultControls.layout,
		bindings: readBindings(stored.bindings),
		sensitivity: unit(stored.sensitivity, defaultControls.sensitivity),
		touchSensitivity: unit(stored.touchSensitivity, defaultControls.touchSensitivity),
		invertY: typeof stored.invertY === 'boolean' ? stored.invertY : defaultControls.invertY,
		fovEffects: typeof stored.fovEffects === 'boolean' ? stored.fovEffects : defaultControls.fovEffects,
	}
}

export const CONTROLS_STORAGE_KEY = 'minemories:viewer-controls'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

/** The visitor's saved controls; defaults when storage is missing, blocked or holds something else. */
export function loadControls(storage: Storage | null | undefined): ControlSettings {
	try {
		return parseControls(storage?.getItem(CONTROLS_STORAGE_KEY) ?? null)
	} catch {
		return defaultControls
	}
}

export function saveControls(storage: Storage | null | undefined, settings: ControlSettings): void {
	try {
		storage?.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(settings))
	} catch {
		// Private mode or blocked storage: the settings last for this visit.
	}
}
