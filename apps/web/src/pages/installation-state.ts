import { isSystem, type System } from '../lib/platform'
import { type LoaderTarget, loaderTargets } from './mod-releases'

export type { System }
export type StepId = 'system' | 'minecraft' | 'loader' | 'install' | 'download' | 'place' | 'verify' | 'memory'
/** Every screen of the guide, in order; the success screen comes after the last one. */
export const stepIds: readonly StepId[] = [
	'system',
	'minecraft',
	'loader',
	'install',
	'download',
	'place',
	'verify',
	'memory',
]
export interface GuideState {
	system: System
	minecraft: string
	loader: string
	/** The screen being shown, or `done` once the first memory is made. */
	step: StepId | 'done'
	/** True once the visitor chose the guided installation (and until they go back to the welcome screen). */
	active: boolean
	/** True when the download table already chose the version and loader: those two questions are skipped. */
	preset: boolean
	/** True when the visitor has no mod loader yet: the guide adds a screen that installs one. */
	needsLoader: boolean
}

export const guideStorageKey = 'minemories-installation-v3'
/** NeoForge 1.21.1 is the combination the written walkthrough and its screenshots were validated on. */
export const walkthrough = { minecraft: '1.21.1', loader: 'neoforge' }
/** The guide preselects no version: the visitor names the one they play before anything else. */
export const defaults: GuideState = {
	system: 'windows',
	minecraft: '',
	loader: '',
	step: 'system',
	active: false,
	preset: false,
	needsLoader: false,
}
/** The Minecraft version the owner validated in game. */
export const validatedMinecraft = '1.21.1'

/** Loaders published for a Minecraft version, in mod/targets.json order. */
export function loadersFor(minecraft: string): LoaderTarget[] {
	return loaderTargets.filter(target => target.minecraft === minecraft)
}
/**
 * The target a choice points to; a loader missing for that version falls back to the first one published, and a
 * version not chosen yet to the walkthrough's target.
 */
export function targetFor(minecraft: string, loader: string): LoaderTarget {
	const candidates = loadersFor(minecraft)
	const found = candidates.find(target => target.loader === loader) ?? candidates[0]
	if (found) return found
	const fallback = loadersFor(walkthrough.minecraft).find(target => target.loader === walkthrough.loader)
	return fallback ?? (loaderTargets[0] as LoaderTarget)
}

/**
 * The loader the guide installs for a visitor who has none: the validated NeoForge walkthrough (with its Windows
 * screenshots) on its Minecraft version, otherwise Fabric when published (the lightest), else the first one.
 */
export function recommendedLoader(minecraft: string): string {
	if (minecraft === walkthrough.minecraft) return walkthrough.loader
	const candidates = loadersFor(minecraft)
	return (candidates.find(target => target.loader === 'fabric') ?? targetFor(minecraft, '')).loader
}

/** The screens this visitor goes through: installing a loader only when they said they have none. */
export function stepsFor(state: Pick<GuideState, 'preset' | 'needsLoader'>): StepId[] {
	return stepIds.filter(id => {
		if (id === 'minecraft' || id === 'loader') return !state.preset
		if (id === 'install') return state.needsLoader && !state.preset
		return true
	})
}

/** The version and loader a link from the download table names, or null when no published target matches. */
export function presetFromSearch(search: URLSearchParams): { minecraft: string; loader: string } | null {
	const minecraft = search.get('minecraft')
	const loader = search.get('loader')
	const target = loaderTargets.find(item => item.minecraft === minecraft && item.loader === loader)
	return target ? { minecraft: target.minecraft, loader: target.loader } : null
}
export const guideLink = (target: Pick<LoaderTarget, 'minecraft' | 'loader'>) =>
	`/installation?minecraft=${encodeURIComponent(target.minecraft)}&loader=${encodeURIComponent(target.loader)}`

/** The saved guide, or null when nothing usable is stored (first visit, damaged value, blocked storage). */
export function readGuide(): GuideState | null {
	try {
		const data = JSON.parse(localStorage.getItem(guideStorageKey) ?? 'null')
		if (!data || typeof data !== 'object') return null
		const chosen = loadersFor(String(data.minecraft)).length > 0
		const target = targetFor(String(data.minecraft), String(data.loader))
		const preset = data.preset === true
		const needsLoader = data.needsLoader === true
		const steps = stepsFor({ preset, needsLoader })
		const step = data.step === 'done' || steps.includes(data.step) ? data.step : 'system'
		return {
			system: isSystem(data.system) ? data.system : defaults.system,
			minecraft: chosen ? target.minecraft : '',
			loader: chosen ? target.loader : '',
			step,
			active: data.active === true,
			preset,
			needsLoader,
		}
	} catch {
		return null
	}
}

export function saveGuide(state: GuideState) {
	try {
		localStorage.setItem(guideStorageKey, JSON.stringify(state))
	} catch {
		// The guide remains usable when browser storage is unavailable.
	}
}

export function resetGuide(system: System): GuideState {
	try {
		localStorage.removeItem(guideStorageKey)
	} catch {
		// Reset the visible guide even when browser storage is unavailable.
	}
	return { ...defaults, system }
}
