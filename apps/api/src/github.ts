/** Injectable `fetch` used for the public GitHub API (tests pass a recorder). */
export type GithubFetch = (url: string, init: RequestInit) => Promise<Response>

export const GITHUB_REPOSITORY = 'For-Hives/minemories'
export const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPOSITORY}`
export const GITHUB_URL = `https://github.com/${GITHUB_REPOSITORY}`
const TIMEOUT_MS = 10_000
const NEXT_LINK = /<([^>]+)>;\s*rel="next"/

/** Optional `GITHUB_TOKEN` (read-only, public data): it only raises GitHub's rate limit. */
export function githubToken(environment: Readonly<Record<string, string | undefined>>): string | undefined {
	return environment.GITHUB_TOKEN?.trim() || undefined
}

/** One GitHub GET with the API headers and a 10 second timeout; rejects on a non-2xx status. */
export async function githubGet(
	fetcher: GithubFetch,
	url: string,
	token?: string
): Promise<{ body: unknown; next: string | null }> {
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'User-Agent': 'minemories-api',
		'X-GitHub-Api-Version': '2022-11-28',
	}
	if (token) headers.Authorization = `Bearer ${token}`
	const response = await fetcher(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
	if (!response.ok) throw new Error(`GitHub request failed with status ${response.status}`)
	const link = response.headers.get('link') ?? ''
	return { body: await response.json(), next: NEXT_LINK.exec(link)?.[1] ?? null }
}
