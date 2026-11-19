import {
	browserRefuses,
	cleanPayload,
	type InsightEventName,
	type InsightEvents,
	type InsightPayload,
	insightRoute,
	insightSettings,
	modDownload,
	optOutKey,
	outboundHost,
} from '../lib/insight'

/** The part of Umami's tracker (window.umami) the site uses. */
interface Tracker {
	track: (name: string, data?: Record<string, unknown>) => unknown
	identify: {
		(id: string, data?: Record<string, unknown>): unknown
		(data: Record<string, unknown>): unknown
	}
}
declare global {
	interface Window {
		umami?: Tracker
		umamiConfig?: Record<string, unknown>
		minemoriesInsightBeforeSend?: (type: string, payload: InsightPayload) => InsightPayload | null
	}
}

/** Calls made before the tracker script arrived, replayed in order once it is there. */
let pending: Array<(tracker: Tracker) => void> = []
let started = false

function run(call: (tracker: Tracker) => void) {
	if (!started) return
	const tracker = window.umami
	if (tracker) {
		try {
			call(tracker)
		} catch {
			/* Statistics never break the page. */
		}
	} else if (pending.length < 50) pending.push(call)
}
function flush() {
	const tracker = window.umami
	if (!tracker) return
	const calls = pending
	pending = []
	for (const call of calls) {
		try {
			call(tracker)
		} catch {
			/* Statistics never break the page. */
		}
	}
}

/** Sends one custom event (lib/insight.ts lists them). A no-op when statistics are off. */
export function track<K extends InsightEventName>(
	name: K,
	...data: InsightEvents[K] extends Record<string, never> ? [] : [InsightEvents[K]]
) {
	run(tracker => tracker.track(name, data[0]))
}
/** Ties this visit to an account's pseudonym (Distinct ID) and stores session properties (cohort, language…). */
export function identify(id: string, data: Record<string, string | boolean>) {
	run(tracker => tracker.identify(id, data))
}

/** Adds session properties to the current visit (captures range, paired game…), without changing who it is. */
export function sessionData(data: Record<string, string | boolean>) {
	run(tracker => tracker.identify(data))
}

/** Whether this device turned visit statistics off (the tracker's own switch). */
export function insightDisabled(): boolean {
	try {
		return Boolean(localStorage.getItem(optOutKey))
	} catch {
		return false
	}
}
export function setInsightDisabled(disabled: boolean) {
	try {
		if (disabled) localStorage.setItem(optOutKey, '1')
		else localStorage.removeItem(optOutKey)
	} catch {
		/* Without storage, the choice cannot be kept. */
	}
}

/** The API's origin (where the proxy and the mod JARs live), set when the tracker starts. */
let apiBase = ''

function onClick(event: MouseEvent) {
	const target = event.target
	if (!(target instanceof Element)) return
	const link = target.closest('a[href]')
	if (!(link instanceof HTMLAnchorElement) || link.dataset.insight === 'off') return
	const page = insightRoute(window.location.pathname).page
	const jar = modDownload(link.href, apiBase)
	if (jar) {
		track('mod-download', { ...jar, page })
		return
	}
	const host = outboundHost(link.href, window.location.origin)
	if (host) track('outbound', { host, page })
}

/**
 * Loads Umami's tracker through the Minemories API's proxy, once, with pageviews, Web Vitals and errors on. Nothing loads for a
 * build without a website id, for a browser that refuses tracking, or after the visitor turned statistics off.
 */
export function startInsight(env: ImportMetaEnv = import.meta.env) {
	if (started) return
	const origin = window.location.origin
	const settings = insightSettings(env)
	if (!settings || insightDisabled() || browserRefuses(navigator as Navigator & { globalPrivacyControl?: boolean }))
		return
	started = true
	apiBase = new URL(settings.hostUrl).origin
	window.minemoriesInsightBeforeSend = (type, payload) =>
		insightDisabled() ? null : cleanPayload(type, payload, origin)
	window.umamiConfig = {
		websiteId: settings.websiteId,
		hostUrl: settings.hostUrl,
		domains: settings.domains,
		autoTrack: true,
		performance: true,
		errors: true,
		release: settings.release,
		environment: settings.environment,
		excludeHash: true,
		doNotTrack: true,
		beforeSend: 'minemoriesInsightBeforeSend',
	}
	const script = document.createElement('script')
	script.defer = true
	script.src = `${settings.hostUrl}/script.js`
	script.addEventListener('load', flush)
	document.head.append(script)
	document.addEventListener('click', onClick, true)
}

/** Test hook: forgets the loaded state. */
export function resetInsightForTests() {
	started = false
	pending = []
	document.removeEventListener('click', onClick, true)
	delete window.umami
	delete window.umamiConfig
	delete window.minemoriesInsightBeforeSend
}
