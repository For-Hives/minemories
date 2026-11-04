export type System = 'windows' | 'mac' | 'linux'
export type Launcher = 'manuel' | 'curseforge' | 'modrinth' | 'autre'
export interface GuideState {
	system: System
	launcher: Launcher
	name: string
	step: number
	done: number[]
	reduceMotion: boolean
}

export const guideStorageKey = 'minemories-installation-v1'
export const defaults: GuideState = {
	system: 'windows',
	launcher: 'manuel',
	name: '',
	step: 0,
	done: [],
	reduceMotion: false,
}

export function readGuide(): GuideState {
	try {
		const data = JSON.parse(localStorage.getItem(guideStorageKey) ?? 'null')
		if (!data || typeof data !== 'object') return defaults
		return {
			system: ['windows', 'mac', 'linux'].includes(data.system) ? data.system : defaults.system,
			launcher: ['manuel', 'curseforge', 'modrinth', 'autre'].includes(data.launcher)
				? data.launcher
				: defaults.launcher,
			name: typeof data.name === 'string' ? data.name.slice(0, 40) : '',
			step: Number.isInteger(data.step) && data.step >= 0 && data.step < 6 ? data.step : 0,
			done: Array.isArray(data.done)
				? [...new Set<number>(data.done.filter((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 6))]
				: [],
			reduceMotion: data.reduceMotion === true,
		}
	} catch {
		return defaults
	}
}

export function saveGuide(state: GuideState) {
	try {
		localStorage.setItem(guideStorageKey, JSON.stringify(state))
	} catch {
		// The guide remains usable when browser storage is unavailable.
	}
}

export function resetGuide(): GuideState {
	try {
		localStorage.removeItem(guideStorageKey)
	} catch {
		// Reset the visible guide even when browser storage is unavailable.
	}
	return { ...defaults, done: [] }
}
