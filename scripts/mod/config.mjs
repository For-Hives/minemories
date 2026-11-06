// Single source of truth for the mod build matrix: mod/targets.json (see docs/features/loader-support.md).
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { repositoryRoot } from '../release-utils.mjs'

export const minecraftPattern = /^\d+(?:\.\d+)*$/
const componentPattern = /^[a-z][a-z0-9_-]*$/
const javaPattern = /^\d+$/
const loaderVersionPattern = /^[a-zA-Z0-9.+-]+$/

export function compareVersions(a, b) {
	return a.localeCompare(b, undefined, { numeric: true })
}

function fail(message) {
	throw new Error(`mod/targets.json : ${message}`)
}

function validateIdentity(item, label) {
	if (!(componentPattern.test(item.loader ?? '') && minecraftPattern.test(item.minecraft ?? '')))
		fail(`${label} : loader ou version de Minecraft invalide.`)
	if (item.id !== `${item.loader}-mc${item.minecraft}`) fail(`${label} : l'id doit valoir <loader>-mc<minecraft>.`)
	if (!javaPattern.test(item.java ?? '')) fail(`${item.id} : "java" est le JDK de compilation (ex. "17").`)
	if (item.dir !== undefined && item.dir !== `mod/${item.minecraft}`)
		fail(`${item.id} : dir doit valoir mod/<minecraft>.`)
}

function validateTarget(target, minecraft) {
	validateIdentity(target, target.id ?? 'cible')
	if (!minecraft.includes(target.minecraft)) fail(`${target.id} : Minecraft ${target.minecraft} absent de "minecraft".`)
	if (typeof target.name !== 'string' || typeof target.enabled !== 'boolean')
		fail(`${target.id} : name/enabled manquant.`)
	if (target.loaderVersion !== null && !loaderVersionPattern.test(target.loaderVersion ?? ''))
		fail(`${target.id} : loaderVersion invalide.`)
	if (target.jar === undefined) {
		if (target.enabled) fail(`${target.id} : une cible activée doit être compilable (jar, dir, project).`)
		return
	}
	if (!(target.jar.includes('{version}') && target.dir && componentPattern.test(target.project ?? '')))
		fail(`${target.id} : jar doit contenir {version} et dir/project doivent être définis.`)
}

/** Validates the parsed file and returns { minecraft, targets, planned }. */
export function validateConfig(raw) {
	const { minecraft, planned = [] } = raw ?? {}
	// A buildable target without `dir` lives in mod/<minecraft> (the 1.21.1 root is the historical default).
	const targets = Array.isArray(raw?.targets)
		? raw.targets.map(t => (t.jar !== undefined && t.dir === undefined ? { ...t, dir: `mod/${t.minecraft}` } : t))
		: raw?.targets
	if (!(Array.isArray(minecraft) && minecraft.length && minecraft.every(v => minecraftPattern.test(v))))
		fail('"minecraft" doit lister des versions (ex. 1.21.1, 26.3).')
	if (!(Array.isArray(targets) && targets.length)) fail('"targets" manquant.')
	const ids = new Set()
	for (const target of targets) {
		validateTarget(target, minecraft)
		if (ids.has(target.id)) fail(`id en double : ${target.id}.`)
		ids.add(target.id)
	}
	for (const item of planned) {
		validateIdentity(item, `prévu ${item.loader}-${item.minecraft}`)
		if (ids.has(item.id)) fail(`${item.id} est à la fois construit et prévu.`)
		ids.add(item.id)
	}
	return { minecraft, targets, planned }
}

export async function readConfig(root = repositoryRoot) {
	return validateConfig(JSON.parse(await readFile(resolve(root, 'mod/targets.json'), 'utf8')))
}

export const isBuildable = target => target.jar !== undefined

/** Enabled targets that can be compiled, in file order. */
export const enabledTargets = config => config.targets.filter(target => target.enabled && isBuildable(target))

/**
 * Resolves CLI selectors: ids (`forge-mc1.18.2`), `<loader> <minecraft>` pairs, or `all`.
 * Throws on an unknown or non-buildable target.
 */
function findTarget(config, word, next) {
	const byId = config.targets.find(t => t.id === word)
	if (byId) return { target: byId, used: 1 }
	const byPair = next === undefined ? undefined : config.targets.find(t => t.loader === word && t.minecraft === next)
	return { target: byPair, used: 2 }
}

export function selectTargets(config, positionals, { all = false } = {}) {
	if (all) return enabledTargets(config)
	const picked = []
	for (let i = 0; i < positionals.length; ) {
		const { target, used } = findTarget(config, positionals[i], positionals[i + 1])
		if (!target) throw new Error(`Cible inconnue : ${positionals.slice(i, i + 2).join(' ')}. Voir « bun mod status ».`)
		if (!isBuildable(target)) throw new Error(`${target.id} n'a pas de projet Gradle (pas de « jar »).`)
		if (!picked.includes(target)) picked.push(target)
		i += used
	}
	return picked
}

/** Unified distribution name of a built JAR. */
export function distFileName(target, version) {
	return `minemories-${target.loader}-mc${target.minecraft}-${version}.jar`
}

/** Cells the quality workflow builds besides the 1.21.1 root (built by the `mod` job). */
export function ciCells(config) {
	return config.targets
		.filter(t => t.enabled && isBuildable(t) && t.dir !== 'mod/1.21.1')
		.map(({ id, loader, minecraft, loaderVersion, dir, project, java }) => ({
			id,
			loader,
			minecraft,
			loaderVersion,
			dir,
			project,
			java,
		}))
}
