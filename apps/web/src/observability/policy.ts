/** Only fixed editorial routes may emit diagnostics. Capture, auth and unknown URLs fail closed. */
const publicRoutes = new Set([
	'/',
	'/concept',
	'/fonctionnement',
	'/installation',
	'/versions',
	'/changelog',
	'/faq',
	'/decouvrir',
	'/open-source',
	'/nostalgie',
	'/partager',
	'/pricing',
	'/privacy',
	'/terms',
	'/legal',
])
const projectPath = /^\/[\w/-]*\d+$/
const failureCodes = new Set(['runtime', 'unhandled-promise', 'page-render'])
export type WebFailure = 'runtime' | 'unhandled-promise' | 'page-render'
export const preferenceKey = 'minemories-web-diagnostics-v1'

export function publicDiagnosticRoute(pathname: string) {
	return publicRoutes.has(pathname) ? pathname : null
}
export function diagnosticDsn(value: string | undefined) {
	if (!value) return null
	try {
		const url = new URL(value)
		if (url.protocol !== 'https:' || !url.username || url.password || url.search || url.hash) return null
		if (!projectPath.test(url.pathname)) return null
		return url.href
	} catch {
		return null
	}
}

/** Rebuild from the allowlist rather than redacting arbitrary exception text or SDK metadata. */
export function diagnosticEvent(code: string, route: string) {
	if (!(failureCodes.has(code) && publicDiagnosticRoute(route))) return null
	return {
		level: 'error' as const,
		platform: 'javascript',
		message: `Minemories public page: ${code}`,
		tags: { code, route },
		fingerprint: ['minemories-web-v1', code, route],
	}
}
