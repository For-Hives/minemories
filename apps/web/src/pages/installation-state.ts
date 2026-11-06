import { type LoaderTarget, loaderTargets } from './mod-releases'

export type System = 'windows' | 'mac' | 'linux'
export interface GuideState {
	system: System
	minecraft: string
	loader: string
	step: number
	done: number[]
}

export const guideStorageKey = 'minemories-installation-v2'
// NeoForge 1.21.1 is the combination the written walkthrough and its screenshots were validated on.
export const defaults: GuideState = {
	system: 'windows',
	minecraft: '1.21.1',
	loader: 'neoforge',
	step: 0,
	done: [],
}

/** Loaders published for a Minecraft version, in mod/targets.json order. */
export function loadersFor(minecraft: string): LoaderTarget[] {
	return loaderTargets.filter(target => target.minecraft === minecraft)
}
/** The target a choice points to; a loader missing for that version falls back to the first one published. */
export function targetFor(minecraft: string, loader: string): LoaderTarget {
	const candidates = loadersFor(minecraft)
	const found = candidates.find(target => target.loader === loader) ?? candidates[0]
	return found ?? (loaderTargets[0] as LoaderTarget)
}

export function readGuide(): GuideState {
	try {
		const data = JSON.parse(localStorage.getItem(guideStorageKey) ?? 'null')
		if (!data || typeof data !== 'object') return defaults
		const target = targetFor(String(data.minecraft), String(data.loader))
		return {
			system: ['windows', 'mac', 'linux'].includes(data.system) ? data.system : defaults.system,
			minecraft: target.minecraft,
			loader: target.loader,
			step: Number.isInteger(data.step) && data.step >= 0 && data.step < 6 ? data.step : 0,
			done: Array.isArray(data.done)
				? [...new Set<number>(data.done.filter((n: unknown) => Number.isInteger(n) && Number(n) >= 0 && Number(n) < 6))]
				: [],
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
