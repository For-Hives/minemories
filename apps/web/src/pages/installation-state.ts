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
}

export const guideStorageKey = 'minemories-installation-v3'
// NeoForge 1.21.1 is the combination the written walkthrough and its screenshots were validated on.
export const defaults: GuideState = {
	system: 'windows',
	minecraft: '1.21.1',
	loader: 'neoforge',
	step: 'system',
	active: false,
	preset: false,
}
/** The Minecraft version the owner validated in game, and the version and loader most players use. */
export const validatedMinecraft = '1.21.1'
export const mostUsed = { minecraft: '1.21.11', loader: 'fabric' }

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

/** The screens this visitor goes through: the questions with a single possible answer are not asked. */
export function stepsFor(state: Pick<GuideState, 'minecraft' | 'preset'>): StepId[] {
	return stepIds.filter(id => {
		if (id === 'minecraft') return !state.preset
		if (id === 'loader') return !state.preset && loadersFor(state.minecraft).length > 1
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
		const target = targetFor(String(data.minecraft), String(data.loader))
		const preset = data.preset === true
		const steps = stepsFor({ minecraft: target.minecraft, preset })
		const step = data.step === 'done' || steps.includes(data.step) ? data.step : 'system'
		return {
			system: isSystem(data.system) ? data.system : defaults.system,
			minecraft: target.minecraft,
			loader: target.loader,
			step,
			active: data.active === true,
			preset,
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
