import { modIndex } from '@minemories/api-contract'
import modTargets from '../../../../mod/targets.json'
import { apiBase } from '../api-client'

/** Versions kept per target by the storage retention (scripts/mod/storage); the page never shows more. */
export const retainedVersions = 3
export const indexUrl = `${apiBase}/downloads/index.json`
export const downloadUrl = (targetId: string, version: string) =>
	`${apiBase}/downloads/${encodeURIComponent(targetId)}/${encodeURIComponent(version)}`
export const latestDownloadUrl = (minecraft: string, loader: string) => {
	const target = loaderTargets.find(item => item.minecraft === minecraft && item.loader === loader)
	return `${apiBase}/downloads/${target?.id ?? ''}/latest`
}
const commitUrl = 'https://github.com/For-Hives/minemories/commit'
const commitPattern = /^[0-9a-f]{7,40}$/
/** Quilt has no JAR of its own: the Fabric JAR is tested under this Quilt Loader (docs/features/loader-support.md). */
export const quiltTestedVersion = '0.30.1'

export interface LoaderTarget {
	id: string
	loader: string
	name: string
	minecraft: string
	loaderVersion: string
	java: string
	fabricApi: string | null
}
export interface LoaderDownload {
	target: LoaderTarget
	url: string
	bytes: number
	sha256: string
}
export interface ModRelease {
	version: string
	/** Link to the commit the build comes from, when the index carries a usable hash. */
	commitUrl: string | null
	/** One download per enabled loader JAR published for this version, in mod/targets.json order. */
	downloads: LoaderDownload[]
	prerelease: boolean
	published: number
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
				},
			]
		: []
)

export function downloadFor(release: ModRelease, loader: string, minecraft?: string): LoaderDownload | null {
	return (
		release.downloads.find(
			download =>
				download.target.loader === loader && (minecraft === undefined || download.target.minecraft === minecraft)
		) ?? null
	)
}
/** Minecraft versions with at least one published target, newest first. */
export function minecraftVersions(targets: LoaderTarget[] = loaderTargets): string[] {
	const parts = (version: string) => version.split('.').map(Number)
	return [...new Set(targets.map(target => target.minecraft))].sort((a, b) => {
		const [x, y] = [parts(a), parts(b)]
		return (y[1] ?? 0) - (x[1] ?? 0) || (y[2] ?? 0) - (x[2] ?? 0)
	})
}

/** Turns the API index into releases: one per version, grouping the loader JARs published for it. */
export function parseIndex(data: unknown): ModRelease[] {
	const parsed = modIndex.safeParse(data)
	if (!parsed.success) throw new Error('Invalid downloads index')
	const releases = new Map<string, ModRelease>()
	for (const target of loaderTargets) {
		const published = parsed.data.targets[target.id]
		for (const entry of published?.versions.slice(0, retainedVersions) ?? []) {
			const release = releases.get(entry.version) ?? {
				version: entry.version,
				commitUrl: commitPattern.test(entry.commit) ? `${commitUrl}/${entry.commit}` : null,
				downloads: [],
				prerelease: entry.version.includes('-'),
				published: Date.parse(entry.builtAt) || 0,
			}
			release.downloads.push({
				target,
				url: downloadUrl(target.id, entry.version),
				bytes: entry.bytes,
				sha256: entry.sha256,
			})
			releases.set(entry.version, release)
		}
	}
	return [...releases.values()].sort((a, b) => b.published - a.published || b.version.localeCompare(a.version))
}
export function selectLatestRelease(data: unknown): ModRelease | null {
	return parseIndex(data)[0] ?? null
}
export async function fetchModReleases(signal: AbortSignal) {
	const response = await fetch(indexUrl, { signal, headers: { Accept: 'application/json' } })
	if (!response.ok) throw new Error('Downloads index unavailable')
	return parseIndex(await response.json())
}
