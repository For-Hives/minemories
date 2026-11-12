import { isSystem, type System } from './platform'

/*
 * The /installation stepper as data: which screens a visitor sees, in which order, and when Continue is allowed. Every
 * function takes the published targets (mod/targets.json, read by pages/mod-targets.ts) and the catalog names as
 * parameters, so a new Minecraft version, loader or catalog changes the guide without touching this file.
 */

/** What the guide needs to know about one published target. */
export interface GuideTarget {
	loader: string
	minecraft: string
}

export type StepId =
	| 'version'
	| 'loader'
	| 'way'
	| 'loader-install'
	| 'app'
	| 'download'
	| 'place'
	| 'check'
	| 'connect'
	| 'memory'
export const stepIds: readonly StepId[] = [
	'version',
	'loader',
	'way',
	'loader-install',
	'app',
	'download',
	'place',
	'check',
	'connect',
	'memory',
]

/** The loader answer of a visitor who has none yet: the guide installs the version's starter loader with them. */
export const noLoader = 'none'
/** The way answer of a visitor who downloads the JAR and drops it in the mods folder; otherwise a catalog name. */
export const fileWay = 'file'

/** The visitor's answers. Empty strings until chosen: the guide preselects nothing. */
export interface Answers {
	minecraft: string
	loader: string
	way: string
	/** Opened from a link of the download table: the version and loader are already known. */
	preset: boolean
}
export interface GuideState extends Answers {
	step: StepId | 'done'
	/** False on the welcome screen. */
	active: boolean
	system: System
}
export const noAnswers: Answers = { minecraft: '', loader: '', way: '', preset: false }

export function loadersFor<T extends GuideTarget>(targets: readonly T[], minecraft: string): T[] {
	return targets.filter(target => target.minecraft === minecraft)
}
export function targetFor<T extends GuideTarget>(targets: readonly T[], minecraft: string, loader: string): T | null {
	return targets.find(target => target.minecraft === minecraft && target.loader === loader) ?? null
}
/** The loader a player without mods installs: Fabric where it is published (the lightest), else the version's first. */
export function starterLoader<T extends GuideTarget>(targets: readonly T[], minecraft: string): T | null {
	const loaders = loadersFor(targets, minecraft)
	return loaders.find(target => target.loader === 'fabric') ?? loaders[0] ?? null
}
/** The target the guide installs: the chosen one, or the starter loader for a visitor without one. */
export function effectiveTarget<T extends GuideTarget>(targets: readonly T[], answers: Answers): T | null {
	if (answers.loader === noLoader) return starterLoader(targets, answers.minecraft)
	return targetFor(targets, answers.minecraft, answers.loader)
}
/**
 * Picking a version keeps the loader when that version has it too, and keeps "no loader yet". A version with a single
 * loader selects it, since there is nothing to choose; otherwise the loader waits for the visitor.
 */
export function chooseMinecraft<A extends Answers>(targets: readonly GuideTarget[], answers: A, minecraft: string): A {
	const loaders = loadersFor(targets, minecraft)
	const kept = answers.loader === noLoader || loaders.some(target => target.loader === answers.loader)
	const only = loaders.length === 1 ? loaders[0]?.loader : undefined
	return { ...answers, minecraft, loader: kept ? answers.loader : (only ?? '') }
}

/** The way the visitor adds the mod: the file when no catalog is listed or the version was preset, the file by default. */
function wayOf(answers: Answers, catalogs: readonly string[]): string {
	if (answers.preset || catalogs.length === 0) return fileWay
	return answers.way || fileWay
}
const viaCatalog = (answers: Answers, catalogs: readonly string[]) => catalogs.includes(wayOf(answers, catalogs))
const viaFile = (answers: Answers, catalogs: readonly string[]) => wayOf(answers, catalogs) === fileWay

/** When each screen is part of the guide, in order. A way not chosen yet counts as the file, so the total is stable. */
const rules: Record<StepId, (answers: Answers, catalogs: readonly string[]) => boolean> = {
	version: answers => !answers.preset,
	loader: answers => !answers.preset,
	way: (answers, catalogs) => !answers.preset && catalogs.length > 0,
	'loader-install': (answers, catalogs) => answers.loader === noLoader && viaFile(answers, catalogs),
	app: viaCatalog,
	download: viaFile,
	place: viaFile,
	check: () => true,
	connect: () => true,
	memory: () => true,
}
export function stepsFor(answers: Answers, catalogs: readonly string[]): StepId[] {
	return stepIds.filter(step => rules[step](answers, catalogs))
}

/** A question screen lets the visitor continue once it is answered; an instruction screen always does. */
export function canContinue(targets: readonly GuideTarget[], step: StepId, answers: Answers): boolean {
	if (step === 'version') return loadersFor(targets, answers.minecraft).length > 0
	if (step === 'loader') return effectiveTarget(targets, answers) !== null
	if (step === 'way') return answers.way !== ''
	return true
}

/** "Step N of M" for the current screen; the success screen counts as past the last one. */
export function stepPosition(state: GuideState, catalogs: readonly string[]): { current: number; total: number } {
	const steps = stepsFor(state, catalogs)
	const index = state.step === 'done' ? steps.length - 1 : Math.max(0, steps.indexOf(state.step))
	return { current: index + 1, total: steps.length }
}
/** The screen after the current one, 'done' after the last. */
export function nextStep(state: GuideState, catalogs: readonly string[]): StepId | 'done' {
	const steps = stepsFor(state, catalogs)
	if (state.step === 'done') return 'done'
	return steps[steps.indexOf(state.step) + 1] ?? 'done'
}
/** The screen before the current one, or null from the first screen (back to the welcome screen). */
export function previousStep(state: GuideState, catalogs: readonly string[]): StepId | null {
	const steps = stepsFor(state, catalogs)
	const index = state.step === 'done' ? steps.length : steps.indexOf(state.step)
	return index > 0 ? (steps[index - 1] as StepId) : null
}

/** The version and loader a link from the download table names, or null when no published target matches. */
export function presetFromSearch(targets: readonly GuideTarget[], search: URLSearchParams): Answers | null {
	const target = targetFor(targets, search.get('minecraft') ?? '', search.get('loader') ?? '')
	return target ? { minecraft: target.minecraft, loader: target.loader, way: fileWay, preset: true } : null
}

const text = (value: unknown) => (typeof value === 'string' ? value : '')
/** The screens a visitor answers; every other screen gives instructions for a version and loader. */
const questionSteps: readonly (StepId | 'done')[] = ['version', 'loader', 'way']
/**
 * A stored guide, checked field by field: an unpublished version or loader is dropped, an unknown way is forgotten and a
 * screen the answers no longer lead to (or an instruction screen without a version and loader) falls back to the first
 * one. A save without a known system takes `fallbackSystem`, the one detected in this browser. Null when nothing usable
 * is stored.
 */
export function parseGuide(
	raw: unknown,
	targets: readonly GuideTarget[],
	catalogs: readonly string[],
	fallbackSystem: System
): GuideState | null {
	if (!raw || typeof raw !== 'object') return null
	const data = raw as Record<string, unknown>
	const minecraft = loadersFor(targets, text(data.minecraft)).length > 0 ? text(data.minecraft) : ''
	const loader = text(data.loader)
	const known = targetFor(targets, minecraft, loader) !== null
	const kept = known || (loader === noLoader && minecraft !== '')
	const way = [fileWay, ...catalogs].includes(text(data.way)) ? text(data.way) : ''
	const answers: Answers = { minecraft, loader: kept ? loader : '', way, preset: data.preset === true && known }
	const steps = stepsFor(answers, catalogs)
	const stored = data.step as StepId | 'done'
	const reachable = stored === 'done' || steps.includes(stored as StepId)
	const instructed = questionSteps.includes(stored) || effectiveTarget(targets, answers) !== null
	// stepsFor always keeps the last three screens, so the first one exists.
	const step = reachable && instructed ? stored : (steps[0] as StepId)
	return {
		...answers,
		step,
		active: data.active === true,
		system: isSystem(data.system) ? data.system : fallbackSystem,
	}
}

/** The help items in the order a screen shows them: the ones about this screen first, then all the others. */
export function helpOrder<Id extends string>(
	all: readonly Id[],
	byStep: Partial<Record<StepId, readonly Id[]>>,
	step: StepId | 'done' | null
): Id[] {
	const first = step && step !== 'done' ? (byStep[step] ?? []) : []
	return [...new Set([...first, ...all])]
}
