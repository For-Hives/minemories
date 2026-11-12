import { type GuideState, noAnswers, parseGuide } from '../lib/install-guide'
import type { System } from '../lib/platform'
import { catalogLinks } from './installation-loaders'
import { isExperimentalMinecraft, type LoaderTarget, loaderTargets, mostTestedMinecraft } from './mod-targets'

/*
 * The browser side of the /installation stepper: the published targets and catalogs it runs on, and the saved state.
 * The rules themselves (screens, branching, validation) live in src/lib/install-guide.ts.
 */

export const guideStorageKey = 'minemories-installation-v5'
/** Earlier saves: v4 held the version and loader of the one-page guide, v3 the old stepper with a preselection. */
const previousKeys = { v4: 'minemories-installation-v4', v3: 'minemories-installation-v3' }

/** The catalog names the guide offers as a way to install (CurseForge while Modrinth is not public). */
export const catalogNames = () => catalogLinks().map(catalog => catalog.name)

/** The welcome screen, before any answer. */
export const welcomeGuide = (system: System): GuideState => ({
	...noAnswers,
	step: 'version',
	active: false,
	system,
})

/** The badge (a catalogue key) of a version: the most tested one, or one not tried in game yet. */
export function versionBadge(minecraft: string): 'Experimental' | 'Most tested' | null {
	if (isExperimentalMinecraft(minecraft)) return 'Experimental'
	return minecraft === mostTestedMinecraft ? 'Most tested' : null
}

export const guideLink = (target: Pick<LoaderTarget, 'minecraft' | 'loader'>) =>
	`/installation?minecraft=${encodeURIComponent(target.minecraft)}&loader=${encodeURIComponent(target.loader)}`

function storedJson(key: string): unknown {
	try {
		return JSON.parse(localStorage.getItem(key) ?? 'null')
	} catch {
		return null
	}
}
function remove(key: string) {
	try {
		localStorage.removeItem(key)
	} catch {
		// Blocked storage: nothing was saved there either.
	}
}

/**
 * The saved guide, or null on a first visit or when nothing usable is stored (damaged value, blocked storage). `system`
 * (detected in this browser) fills a save that has none, such as a v4 save. A v4 save keeps its version and loader and
 * starts on the welcome screen; a v3 save is dropped (it carried a preselection).
 */
export function readGuide(system: System): GuideState | null {
	remove(previousKeys.v3)
	const saved = parseGuide(storedJson(guideStorageKey), loaderTargets, catalogNames(), system)
	if (saved) return saved
	const v4 = storedJson(previousKeys.v4)
	remove(previousKeys.v4)
	return v4 && typeof v4 === 'object'
		? parseGuide({ ...v4, active: false }, loaderTargets, catalogNames(), system)
		: null
}

export function saveGuide(guide: GuideState) {
	try {
		localStorage.setItem(guideStorageKey, JSON.stringify(guide))
	} catch {
		// The guide remains usable when browser storage is unavailable.
	}
}
export function clearGuide() {
	remove(guideStorageKey)
}
