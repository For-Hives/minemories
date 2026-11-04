import modTargets from '../../../../config/mod-targets.json'

export const releasesUrl = 'https://github.com/For-Hives/minemories/releases'
export const releasesApi = 'https://api.github.com/repos/For-Hives/minemories/releases'
export const releasesPageSize = 30
const versionPattern = /^mod-v(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/
const digestPattern = /^sha256:([a-f0-9]{64})$/
/** Quilt has no JAR of its own: the Fabric JAR is tested under this Quilt Loader (docs/features/loader-support.md). */
export const quiltTestedVersion = '0.30.1'

export interface LoaderTarget {
	loader: string
	name: string
	minecraft: string
	loaderVersion: string
	java: string
	fabricApi: string | null
	/** Release asset name, as produced by `filenameFor` in scripts/release-utils.mjs. */
	jarName: string
}
export interface LoaderDownload {
	target: LoaderTarget
	url: string
	bytes: number
	sha256: string | null
	checksumUrl: string | null
}
export interface ModRelease {
	version: string
	pageUrl: string
	/** One download per enabled loader JAR found in the release, in config/mod-targets.json order. */
	downloads: LoaderDownload[]
	prerelease: boolean
	published: number
	notes: string
}

/** Enabled publication targets, read at build time from config/mod-targets.json. */
export const loaderTargets: LoaderTarget[] = modTargets.targets.flatMap(target =>
	target.enabled && target.loaderVersion
		? [
				{
					loader: target.loader,
					name: target.name,
					minecraft: target.minecraft,
					loaderVersion: target.loaderVersion,
					java: target.java,
					fabricApi: 'fabricApi' in target ? target.fabricApi : null,
					jarName: `minemories-${target.id}.jar`,
				},
			]
		: []
)

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}
function parseDownload(assets: Record<string, unknown>[], prefix: string, target: LoaderTarget): LoaderDownload[] {
	const url = `${prefix}${target.jarName}`
	const asset = assets.find(item => item.name === target.jarName && item.browser_download_url === url)
	if (!(asset && Number.isSafeInteger(asset.size)) || (asset.size as number) < 4) return []
	const checksumUrl = `${url}.sha256`
	const checksum = assets.some(
		item => item.name === `${target.jarName}.sha256` && item.browser_download_url === checksumUrl
	)
	return [
		{
			target,
			url,
			bytes: asset.size as number,
			sha256: typeof asset.digest === 'string' ? (digestPattern.exec(asset.digest)?.[1] ?? null) : null,
			checksumUrl: checksum ? checksumUrl : null,
		},
	]
}
function parseRelease(value: unknown): ModRelease | null {
	if (!record(value)) return null
	if (
		value.draft !== false ||
		typeof value.tag_name !== 'string' ||
		typeof value.published_at !== 'string' ||
		!Array.isArray(value.assets)
	)
		return null
	const version = versionPattern.exec(value.tag_name)?.[1]
	const published = Date.parse(value.published_at)
	if (!(version && Number.isFinite(published))) return null
	const prefix = `${releasesUrl}/download/${encodeURIComponent(value.tag_name)}/`
	const assets = value.assets.filter(record)
	const downloads = loaderTargets.flatMap(target => parseDownload(assets, prefix, target))
	if (downloads.length === 0) return null
	return {
		version,
		pageUrl: `${releasesUrl}/tag/${encodeURIComponent(value.tag_name)}`,
		downloads,
		prerelease: value.prerelease === true || version.includes('-'),
		published,
		notes: typeof value.body === 'string' ? value.body : '',
	}
}

export function downloadFor(release: ModRelease, loader: string): LoaderDownload | null {
	return release.downloads.find(download => download.target.loader === loader) ?? null
}
export function parseReleases(data: unknown): ModRelease[] {
	if (!Array.isArray(data)) return []
	return mergeReleases(
		[],
		data.map(parseRelease).filter((release): release is ModRelease => release !== null)
	)
}
export function mergeReleases(previous: ModRelease[], next: ModRelease[]): ModRelease[] {
	return [...new Map([...previous, ...next].map(release => [release.version, release])).values()].sort(
		(a, b) => b.published - a.published || b.version.localeCompare(a.version)
	)
}
export function selectLatestRelease(data: unknown): ModRelease | null {
	return parseReleases(data)[0] ?? null
}
export async function fetchReleasePage(page: number, signal: AbortSignal) {
	const response = await fetch(`${releasesApi}?per_page=${releasesPageSize}&page=${page}`, {
		signal,
		headers: { Accept: 'application/vnd.github+json' },
	})
	if (!response.ok) throw new Error('GitHub releases unavailable')
	const data: unknown = await response.json()
	if (!Array.isArray(data)) throw new Error('Invalid GitHub releases response')
	return { releases: parseReleases(data), hasMore: data.length === releasesPageSize }
}
