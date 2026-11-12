import { isExperimentalMinecraft, type LoaderTarget, loaderTargets } from './mod-releases'

/** What the visitor picked on /installation: a Minecraft version, then one of its loaders. Empty until chosen. */
export interface Choice {
	minecraft: string
	loader: string
}

export const choiceStorageKey = 'minemories-installation-v4'
/** The guide preselects no version: the visitor names the one they play before anything else. */
export const noChoice: Choice = { minecraft: '', loader: '' }
/** The Minecraft version the owner validated in game, called "most tested" on the site. */
export const validatedMinecraft = '1.21.1'

/** The badge (a catalogue key) of a version: the one validated in game, or one not tried in game yet. */
export function versionBadge(minecraft: string): string | null {
	if (isExperimentalMinecraft(minecraft)) return 'Experimental'
	return minecraft === validatedMinecraft ? 'Most tested' : null
}

/** Loaders published for a Minecraft version, in mod/targets.json order. */
export function loadersFor(minecraft: string): LoaderTarget[] {
	return loaderTargets.filter(target => target.minecraft === minecraft)
}
/** The published target of a version and loader, or null while the pair is not chosen or not published. */
export function targetFor(minecraft: string, loader: string): LoaderTarget | null {
	return loaderTargets.find(target => target.minecraft === minecraft && target.loader === loader) ?? null
}

/**
 * Picking a version keeps the loader when that version has it too. A version with a single loader selects it, since
 * there is nothing to choose; otherwise the loader waits for the visitor.
 */
export function chooseMinecraft(current: Choice, minecraft: string): Choice {
	const loaders = loadersFor(minecraft)
	const kept = loaders.find(target => target.loader === current.loader)
	const only = loaders.length === 1 ? loaders[0] : undefined
	return { minecraft, loader: (kept ?? only)?.loader ?? '' }
}

/** The loader a player without mods installs: Fabric where it is published (the lightest), else the version's first. */
export function starterLoader(minecraft: string): LoaderTarget | null {
	const loaders = loadersFor(minecraft)
	return loaders.find(target => target.loader === 'fabric') ?? loaders[0] ?? null
}

/** The version and loader a link from the download table names, or null when no published target matches. */
export function presetFromSearch(search: URLSearchParams): Choice | null {
	const target = targetFor(search.get('minecraft') ?? '', search.get('loader') ?? '')
	return target ? { minecraft: target.minecraft, loader: target.loader } : null
}
export const guideLink = (target: Pick<LoaderTarget, 'minecraft' | 'loader'>) =>
	`/installation?minecraft=${encodeURIComponent(target.minecraft)}&loader=${encodeURIComponent(target.loader)}`

/** The saved choice, or null when nothing usable is stored (first visit, damaged value, blocked storage). */
export function readChoice(): Choice | null {
	try {
		const data = JSON.parse(localStorage.getItem(choiceStorageKey) ?? 'null')
		if (!data || typeof data !== 'object' || loadersFor(String(data.minecraft)).length === 0) return null
		return chooseMinecraft({ minecraft: '', loader: String(data.loader) }, String(data.minecraft))
	} catch {
		return null
	}
}

export function saveChoice(choice: Choice) {
	try {
		localStorage.setItem(choiceStorageKey, JSON.stringify(choice))
	} catch {
		// The guide remains usable when browser storage is unavailable.
	}
}
