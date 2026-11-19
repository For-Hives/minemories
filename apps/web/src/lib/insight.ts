import { splitLocalePath } from './locale-path'

/**
 * Visit statistics (Umami, self-hosted) without leaking what is private. Everything the tracker sends goes through
 * `cleanPayload` first: share tokens and public ids become placeholders, the query keeps only campaign parameters, the
 * fragment is dropped, and private pages lose their title (a capture's name). docs/features/visit-statistics.md.
 */

/** Where the Minemories API relays the tracker and its collect endpoint (apps/api/src/insight-proxy.ts), so blockers
 * that refuse third-party analytics hosts still let first-party requests through. */
export const insightPath = '/api/insight'
/** The tracker's own opt-out switch: any value in this key stops every request (pageviews, events, errors, vitals). */
export const optOutKey = 'umami.disabled'
/** The account a pending sign-up came from, kept across the OAuth redirect (sessionStorage). */
export const authProviderKey = 'minemories-insight-provider'
/** Accounts already counted as a sign-up on this device (localStorage), so a reload never counts twice. */
export const signupSeenKey = 'minemories-insight-signup'

/** The query parameters kept on a page URL: Umami's UTM, attribution and ad click ids. Anything else may be private. */
const keptParams = new Set([
	'utm_source',
	'utm_medium',
	'utm_campaign',
	'utm_term',
	'utm_content',
	'ref',
	'gclid',
	'fbclid',
	'msclkid',
	'ttclid',
	'twclid',
	'li_fat_id',
])
/** Pages whose path carries a secret or an id: the value never leaves the browser. */
const placeholders: ReadonlyArray<[RegExp, string]> = [
	[/^\/share\/[^/]+/, '/share/:token'],
	[/^\/public\/[^/]+/, '/public/:id'],
]
const leadingWww = /^www\./
const jarPath = /^\/downloads\/([^/]+)\/([^/]+)$/
const trailingSlashes = /\/+$/
/** Pages never measured: operator tools. */
const excluded = /^\/(?:admin|moderation)(?:\/|$)/
/** Pages whose title may name a capture, a server or a person. */
const privateTitle = /^\/(?:share|public|viewer|gallery|account)(?:\/|$)/

export interface InsightRoute {
	/** The path as sent, language prefix kept ("/fr/share/:token"). */
	path: string
	/** The path the router sees, without its language prefix. */
	page: string
	excluded: boolean
	privateTitle: boolean
}

export function insightRoute(pathname: string): InsightRoute {
	const { prefix, path } = splitLocalePath(pathname)
	const page = placeholders.reduce((current, [pattern, value]) => current.replace(pattern, value), path)
	const full = page === '/' && prefix ? prefix : `${prefix}${page}`
	return { path: full, page, excluded: excluded.test(page), privateTitle: privateTitle.test(page) }
}

function keptSearch(params: URLSearchParams) {
	const kept = new URLSearchParams()
	for (const [key, value] of params) if (keptParams.has(key.toLowerCase())) kept.append(key, value)
	const search = kept.toString()
	return search ? `?${search}` : ''
}

/** A page URL as sent: absolute stays absolute, a path stays a path. `null` for a page that is never measured. */
export function cleanUrl(value: string, origin: string): string | null {
	let url: URL
	try {
		url = new URL(value, origin)
	} catch {
		return null
	}
	const route = insightRoute(url.pathname)
	if (route.excluded) return null
	const relative = `${route.path}${keptSearch(url.searchParams)}`
	return value.startsWith('/') ? relative : `${url.origin}${relative}`
}

/** A referrer as sent: the site's own pages are cleaned like page URLs, another site keeps its origin and path only. */
export function cleanReferrer(value: string | undefined, origin: string): string {
	if (!value) return ''
	let url: URL
	try {
		url = new URL(value, origin)
	} catch {
		return ''
	}
	if (url.origin !== origin) return `${url.origin}${url.pathname}`
	const route = insightRoute(url.pathname)
	return route.excluded ? '' : route.path
}

/** What the tracker hands to `beforeSend`: the fields this module reads, the rest passed through untouched. */
export interface InsightPayload {
	url?: string
	referrer?: string
	title?: string
	[key: string]: unknown
}
export type InsightPayloadType = 'event' | 'identify' | 'performance' | 'error' | string

/** The tracker's `beforeSend`: the cleaned payload, or `null` to send nothing. */
export function cleanPayload(type: InsightPayloadType, payload: InsightPayload, origin: string): InsightPayload | null {
	if (!payload || typeof payload !== 'object') return null
	const next: InsightPayload = { ...payload }
	if (typeof payload.url === 'string') {
		const url = cleanUrl(payload.url, origin)
		if (url === null) return null
		next.url = url
		const route = insightRoute(new URL(url, origin).pathname)
		if (route.privateTitle && 'title' in payload) next.title = `Minemories ${route.page}`
	}
	if (type !== 'error' && 'referrer' in payload)
		next.referrer = cleanReferrer(typeof payload.referrer === 'string' ? payload.referrer : '', origin)
	return next
}

/** The sign-in methods, as they appear in the statistics. */
export type AuthMethod = 'email' | 'google' | 'discord'
/** Where a capture is opened from. */
export type ViewerSource = 'gallery' | 'share' | 'public'

/**
 * Every custom event the site sends, with its data. Names are Umami goals, funnel steps and cohort criteria: renaming
 * one breaks the reports built on it (docs/features/visit-statistics.md lists them).
 */
export interface InsightEvents {
	/** A Google or Discord button was pressed (`login` or `signup` confirms it when the account comes back). */
	'auth-start': { provider: AuthMethod; mode: 'login' | 'register' | 'link' }
	/** An existing account signed in (first signed-in page after a sign-in started on this tab). */
	login: { method: AuthMethod }
	/** A new account's first signed-in page, once per account and device. */
	signup: { method: AuthMethod }
	signout: Record<string, never>
	/** A mod JAR download link was followed: target as in mod/targets.json, version or "latest", page it was on. */
	'mod-download': { target: string; version: string; page: string }
	/** A link to another site was followed (CurseForge, Modrinth, Discord, GitHub…). */
	outbound: { host: string; page: string }
	/** The gallery issued a 6-digit pairing code. */
	'pairing-code': Record<string, never>
	/** The game used the code: the account now receives captures. */
	'pairing-done': Record<string, never>
	/** A capture finished loading in the 3D viewer. */
	'viewer-open': { source: ViewerSource }
	/** A share link was created or stopped, for one capture or a whole world. */
	'share-create': { scope: string }
	'share-revoke': { scope: string }
	/** A capture was submitted to the public Explore page (moderated before it shows). */
	'public-publish': Record<string, never>
	'public-revoke': Record<string, never>
	/** The owner downloaded a capture's .glb. */
	'glb-download': Record<string, never>
	'capture-trash': Record<string, never>
	'capture-restore': Record<string, never>
	'capture-delete': Record<string, never>
	'trash-empty': Record<string, never>
	'explore-vote': Record<string, never>
	'explore-report': Record<string, never>
	'language-change': { from: string; to: string }
}
export type InsightEventName = keyof InsightEvents

/** A count as a coarse range, so session data never holds an exact figure. */
export function countBucket(count: number): string {
	if (!Number.isFinite(count) || count <= 0) return '0'
	if (count === 1) return '1'
	if (count <= 5) return '2-5'
	if (count <= 20) return '6-20'
	if (count <= 100) return '21-100'
	return '100+'
}

/** The month an account was created ("2026-11"), the cohort it belongs to. */
export function joinedMonth(createdAt: Date | string | undefined): string | undefined {
	if (!createdAt) return undefined
	const date = new Date(createdAt)
	return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 7)
}

/** An account created less than ten minutes ago: its first signed-in page counts as a sign-up. */
export function isNewAccount(createdAt: Date | string | undefined, now: number): boolean {
	if (!createdAt) return false
	const age = now - new Date(createdAt).getTime()
	return age >= 0 && age < 10 * 60_000
}

/**
 * The Distinct ID of an account: a pseudonym, not the account id. The operator can recompute it for one account (to
 * answer a data request); Umami alone cannot go back to the account.
 */
export async function distinctId(userId: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`minemories:${userId}`))
	const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
	return `u${hex.slice(0, 31)}`
}

/** The host of a link to another site, or `null` for the site's own pages and non-web links. */
export function outboundHost(href: string, origin: string): string | null {
	try {
		const url = new URL(href, origin)
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
		return url.origin === origin ? null : url.hostname.replace(leadingWww, '')
	} catch {
		return null
	}
}

/** A mod JAR link (the API's /downloads/<target>/<version>), or `null` for any other link. */
export function modDownload(href: string, apiBase: string): { target: string; version: string } | null {
	try {
		const url = new URL(href)
		const base = new URL(apiBase)
		if (url.origin !== base.origin) return null
		const [, target, version] = jarPath.exec(url.pathname) ?? []
		if (!(target && version)) return null
		return { target: decodeURIComponent(target), version: decodeURIComponent(version) }
	} catch {
		return null
	}
}

/** Visitors who asked browsers not to be tracked: Global Privacy Control, or Do Not Track. */
export function browserRefuses(nav: { globalPrivacyControl?: boolean; doNotTrack?: string | null }): boolean {
	return nav.globalPrivacyControl === true || nav.doNotTrack === '1' || nav.doNotTrack === 'yes'
}

export interface InsightSettings {
	websiteId: string
	hostUrl: string
	domains: string[]
	release: string
	environment: string
}
interface InsightEnv {
	VITE_API_URL?: string
	VITE_INSIGHT_WEBSITE_ID?: string
	VITE_SITE_URL?: string
	VITE_RELEASE?: string
	MODE?: string
	PROD?: boolean
}
/** The production website, overridable at build time; `off` (or a dev build without an id) disables it. */
export const defaultWebsiteId = 'b54859d4-0ee2-4556-b6b5-985c86707a22'

/** The tracker's settings for this build and page, or `null` when nothing may be measured. */
export function insightSettings(env: InsightEnv): InsightSettings | null {
	const configured = env.VITE_INSIGHT_WEBSITE_ID?.trim()
	if (configured === 'off') return null
	const websiteId = configured || (env.PROD ? defaultWebsiteId : '')
	if (!websiteId) return null
	let siteHost: string
	try {
		siteHost = new URL(env.VITE_SITE_URL || 'https://minemories.net').hostname
	} catch {
		return null
	}
	return {
		websiteId,
		hostUrl: `${(env.VITE_API_URL || 'http://localhost:3001').replace(trailingSlashes, '')}${insightPath}`,
		domains: [siteHost],
		release: env.VITE_RELEASE || 'dev',
		environment: env.MODE === 'production' ? 'production' : (env.MODE ?? 'development'),
	}
}
