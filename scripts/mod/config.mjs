// Single source of truth for the mod build matrix: mod/targets.json (see docs/features/loader-support.md).
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { repositoryRoot } from './utils.mjs'

export const minecraftPattern = /^\d+(?:\.\d+)*$/
const componentPattern = /^[a-z][a-z0-9_-]*$/
const javaPattern = /^\d+$/
const loaderVersionPattern = /^[a-zA-Z0-9.+-]+$/

export function compareVersions(a, b) {
	return a.localeCompare(b, undefined, { numeric: true })
}

function fail(message) {
	throw new Error(`mod/targets.json: ${message}`)
}

function validateIdentity(item, label) {
	if (!(componentPattern.test(item.loader ?? '') && minecraftPattern.test(item.minecraft ?? '')))
		fail(`${label}: invalid loader or Minecraft version.`)
	if (item.id !== `${item.loader}-mc${item.minecraft}`) fail(`${label}: the id must be <loader>-mc<minecraft>.`)
	if (!javaPattern.test(item.java ?? '')) fail(`${item.id}: "java" is the compilation JDK (e.g. "17").`)
	if (item.dir !== undefined && item.dir !== `mod/${item.minecraft}`) fail(`${item.id}: dir must be mod/<minecraft>.`)
}

function validateTarget(target, minecraft) {
	validateIdentity(target, target.id ?? 'target')
	if (!minecraft.includes(target.minecraft))
		fail(`${target.id}: Minecraft ${target.minecraft} is missing from "minecraft".`)
	if (typeof target.name !== 'string' || typeof target.enabled !== 'boolean')
		fail(`${target.id}: name/enabled missing.`)
	if (target.loaderVersion !== null && !loaderVersionPattern.test(target.loaderVersion ?? ''))
		fail(`${target.id}: invalid loaderVersion.`)
	if (target.jar === undefined) {
		if (target.enabled) fail(`${target.id}: an enabled target must be buildable (jar, dir, project).`)
		return
	}
	if (!(target.jar.includes('{version}') && target.dir && componentPattern.test(target.project ?? '')))
		fail(`${target.id}: jar must contain {version} and dir/project must be set.`)
}

/** Validates the parsed file and returns { minecraft, targets, planned }. */
export function validateConfig(raw) {
	const { minecraft, planned = [] } = raw ?? {}
	// A buildable target without `dir` lives in mod/<minecraft> (the 1.21.1 root is the historical default).
	const targets = Array.isArray(raw?.targets)
		? raw.targets.map(t => (t.jar !== undefined && t.dir === undefined ? { ...t, dir: `mod/${t.minecraft}` } : t))
		: raw?.targets
	if (!(Array.isArray(minecraft) && minecraft.length && minecraft.every(v => minecraftPattern.test(v))))
		fail('"minecraft" must list versions (e.g. 1.21.1, 26.3).')
	if (!(Array.isArray(targets) && targets.length)) fail('"targets" missing.')
	const ids = new Set()
	for (const target of targets) {
		validateTarget(target, minecraft)
		if (ids.has(target.id)) fail(`duplicate id: ${target.id}.`)
		ids.add(target.id)
	}
	for (const item of planned) {
		validateIdentity(item, `planned ${item.loader}-${item.minecraft}`)
		if (ids.has(item.id)) fail(`${item.id} is both built and planned.`)
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
		if (!target) throw new Error(`Unknown target: ${positionals.slice(i, i + 2).join(' ')}. See "bun mod status".`)
		if (!isBuildable(target)) throw new Error(`${target.id} has no Gradle project (no "jar").`)
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
