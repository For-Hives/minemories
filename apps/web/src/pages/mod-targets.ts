import modTargets from '../../../../mod/targets.json'

/*
 * The published Minecraft targets and the version wording built from them. Free of the API client and its contract, so
 * the head metadata loaded on every page (the FAQ's JSON-LD) can name the supported versions; mod-releases.ts
 * re-exports all of it.
 */

export interface LoaderTarget {
	id: string
	loader: string
	name: string
	minecraft: string
	loaderVersion: string
	java: string
	fabricApi: string | null
	/** False while the target is published but not yet exercised in game (an experimental Minecraft version). */
	validated: boolean
}
/** Enabled publication targets, read at build time from mod/targets.json. */
export const loaderTargets: LoaderTarget[] = modTargets.targets.flatMap(target =>
	target.enabled && target.loaderVersion
		? [
				{
					id: target.id,
					loader: target.loader,
					name: target.name,
					minecraft: target.minecraft,
					loaderVersion: target.loaderVersion,
					java: target.java,
					fabricApi: 'fabricApi' in target ? target.fabricApi : null,
					validated: target.validatedInGame,
				},
			]
		: []
)

const versionParts = (version: string) => version.split('.').map(Number)
/** Numeric comparison, part by part from the major: 26.3 is newer than 1.21.11, which is newer than 1.21.1. */
export function compareMinecraft(a: string, b: string): number {
	const [x, y] = [versionParts(a), versionParts(b)]
	for (let index = 0; index < Math.max(x.length, y.length); index++) {
		const difference = (x[index] ?? 0) - (y[index] ?? 0)
		if (difference !== 0) return difference
	}
	return 0
}
/** Minecraft versions with at least one published target, newest first. */
export function minecraftVersions(targets: LoaderTarget[] = loaderTargets): string[] {
	return [...new Set(targets.map(target => target.minecraft))].sort((a, b) => compareMinecraft(b, a))
}
/** A Minecraft version none of whose published targets has been exercised in game yet. */
export function isExperimentalMinecraft(minecraft: string, targets: LoaderTarget[] = loaderTargets): boolean {
	const published = targets.filter(target => target.minecraft === minecraft)
	return published.length > 0 && published.every(target => !target.validated)
}
/**
 * The published Minecraft versions as the site words them, oldest first and joined with commas (no localized "and",
 * so the landing's static translation values stay valid in every language): validated ones, then experimental ones.
 */
export function supportedMinecraft(targets: LoaderTarget[] = loaderTargets): {
	versions: string
	experimental: string
} {
	const versions = minecraftVersions(targets).reverse()
	const experimental = versions.filter(version => isExperimentalMinecraft(version, targets))
	return {
		versions: versions.filter(version => !experimental.includes(version)).join(', '),
		experimental: experimental.join(', '),
	}
}
/**
 * The published Minecraft versions in the order the guide and the download table list them: newest first, the
 * experimental ones last (26.3 is the newest number but the least tried).
 */
export function listedMinecraft(targets: LoaderTarget[] = loaderTargets): string[] {
	const versions = minecraftVersions(targets)
	const experimental = versions.filter(version => isExperimentalMinecraft(version, targets))
	return [...versions.filter(version => !experimental.includes(version)), ...experimental]
}
/** The Java version a Minecraft version's JARs need (the same for all its loaders), or null when none is published. */
export function javaFor(minecraft: string, targets: LoaderTarget[] = loaderTargets): string | null {
	return targets.find(target => target.minecraft === minecraft)?.java ?? null
}
