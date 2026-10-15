export const releasesUrl = 'https://github.com/For-Hives/minemories/releases'
export const releasesApi = 'https://api.github.com/repos/For-Hives/minemories/releases'
export const releasesPageSize = 30
export const jarName = 'minemories-neoforge-mc1.21.1.jar'
const versionPattern = /^mod-v(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/
const digestPattern = /^sha256:([a-f0-9]{64})$/

export interface ModRelease {
	version: string
	url: string
	pageUrl: string
	bytes: number
	sha256: string | null
	checksumUrl: string | null
	prerelease: boolean
	published: number
	notes: string
}

function record(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
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
	const asset = assets.find(item => item.name === jarName && item.browser_download_url === `${prefix}${jarName}`)
	if (!(asset && Number.isSafeInteger(asset.size)) || (asset.size as number) < 4) return null
	const checksum = assets.find(
		item => item.name === `${jarName}.sha256` && item.browser_download_url === `${prefix}${jarName}.sha256`
	)
	return {
		version,
		url: `${prefix}${jarName}`,
		pageUrl: `${releasesUrl}/tag/${encodeURIComponent(value.tag_name)}`,
		bytes: asset.size as number,
		sha256: typeof asset.digest === 'string' ? (digestPattern.exec(asset.digest)?.[1] ?? null) : null,
		checksumUrl: checksum ? `${prefix}${jarName}.sha256` : null,
		prerelease: value.prerelease === true || version.includes('-'),
		published,
		notes: typeof value.body === 'string' ? value.body : '',
	}
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
