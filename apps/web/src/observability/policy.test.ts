import { expect, test } from 'vitest'
import { diagnosticDsn, diagnosticEvent, publicDiagnosticRoute } from './policy'

test('only fixed editorial routes can emit diagnostics; captures and identifiers fail closed', () => {
	for (const route of ['/', '/concept', '/privacy', '/installation']) expect(publicDiagnosticRoute(route)).toBe(route)
	for (const route of [
		'/gallery',
		'/account',
		'/admin',
		'/diagnostics',
		'/login',
		'/register',
		'/viewer',
		'/viewer?id=secret',
		'/share/secret',
		'/public/id',
		'/blog/private',
		'/unknown',
		'/privacy?code=123456',
	]) {
		expect(publicDiagnosticRoute(route)).toBeNull()
	}
})
test('accepts only public HTTPS ingestion DSNs without secret credentials or extra URL data', () => {
	expect(diagnosticDsn('https://public@ingest.example/12')).toBe('https://public@ingest.example/12')
	expect(diagnosticDsn('https://public@ingest.example/prefix/12')).toBeTruthy()
	for (const input of [
		undefined,
		'',
		'invalid',
		'http://key@localhost/1',
		'https://key:secret@ingest.example/1',
		'https://ingest.example/1',
		'https://key@ingest.example/1?token=secret',
		'https://key@ingest.example/1#private',
		'https://key@ingest.example/not-project',
	])
		expect(diagnosticDsn(input)).toBeNull()
})
test('reconstructs events solely from known codes and routes, rejecting arbitrary exception text', () => {
	expect(diagnosticEvent('runtime', '/')).toEqual({
		level: 'error',
		platform: 'javascript',
		message: 'Minemories public page: runtime',
		tags: { code: 'runtime', route: '/' },
		fingerprint: ['minemories-web-v1', 'runtime', '/'],
	})
	expect(diagnosticEvent('page-render', '/concept')).not.toBeNull()
	expect(diagnosticEvent('unhandled-promise', '/privacy')).not.toBeNull()
	expect(diagnosticEvent('token=secret', '/')).toBeNull()
	expect(diagnosticEvent('runtime', '/gallery')).toBeNull()
})
