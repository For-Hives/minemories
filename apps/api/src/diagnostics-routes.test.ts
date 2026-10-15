import { afterAll, expect, spyOn, test } from 'bun:test'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { version } from '../package.json'
import { minimalGlb } from './test-support/glb-fixture'

const directory = mkdtempSync(join(tmpdir(), 'minemories-diagnostics-http-'))
process.env.DATABASE_PATH = join(directory, 'test.sqlite')
process.env.LOCAL_OBJECTS_PATH = join(directory, 'objects')
process.env.STORAGE_DRIVER = 'filesystem'
process.env.BETTER_AUTH_SECRET = 'test-auth-secret-at-least-32-characters'
process.env.PAIRING_PEPPER = 'test-pairing-pepper-at-least-32-characters'
const { app, fetchApi } = await import('./index')
const { database } = await import('./database')
const { createPairingCode, exchangePairingCode } = await import('./pairing')
const { diagnostics } = await import('./diagnostics-state')
const { recordApiFailure, safeApiException, requestCorrelation, logApiFailure } = await import('./safe-errors')
afterAll(() => {
	database.close()
	rmSync(directory, { recursive: true, force: true })
})
function submission() {
	return {
		consent: true,
		report: {
			id: randomUUID(),
			occurredAt: new Date().toISOString(),
			source: 'mod',
			phase: 'upload',
			versions: { mod: '0.1.0', minecraft: '1.21.1', loader: 'neoforge-21.1.248' },
			correlationId: randomUUID(),
			exception: {
				type: 'java.io.IOException',
				frames: [
					{
						className: 'dev.minemories.core.ChunkedUploader',
						methodName: 'upload',
						fileName: 'ChunkedUploader.java',
						lineNumber: 10,
					},
				],
			},
			breadcrumbs: [{ step: 'upload_chunk', elapsedMs: 42 }],
		},
	}
}
function pair() {
	return exchangePairingCode(createPairingCode(randomUUID()).code, 'Private device') as {
		deviceId: string
		deviceToken: string
	}
}
function request(body: unknown, token: string, permit = '') {
	return app.request('/api/mod/diagnostics', {
		method: 'POST',
		body: JSON.stringify(body),
		headers: {
			authorization: `Bearer ${token}`,
			'content-type': 'application/json',
			'x-minemories-diagnostics-permit': permit,
		},
	})
}
async function enable(token: string) {
	const response = await app.request('/api/mod/diagnostics/consent', {
		method: 'POST',
		body: '{"enabled":true}',
		headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
	})
	expect(response.status).toBe(200)
	return ((await response.json()) as { permit: string }).permit
}
test('HTTP reports require current pairing, explicit consent, a permit and strictly typed private fields', async () => {
	const { deviceToken } = pair()
	const permit = await enable(deviceToken)
	expect((await request(submission(), '')).status).toBe(401)
	expect((await request(submission(), 'invalid')).status).toBe(401)
	expect((await request(submission(), deviceToken)).status).toBe(403)
	expect((await request(submission(), deviceToken, randomUUID())).status).toBe(403)
	const invalid = [
		null,
		{},
		{ ...submission(), consent: false },
		{ ...submission(), message: 'token secret' },
		{ ...submission(), report: { ...submission().report, source: 'api' } },
		{
			...submission(),
			report: {
				...submission().report,
				versions: { ...submission().report.versions, mod: 'https://private.example/' },
			},
		},
		{
			...submission(),
			report: { ...submission().report, exception: { type: 'java.lang.Error', frames: [], message: 'secret' } },
		},
		{
			...submission(),
			report: {
				...submission().report,
				exception: { type: 'java.lang.Error', frames: [{ className: 'private.player.Name', methodName: 'secret' }] },
			},
		},
		{
			...submission(),
			report: {
				...submission().report,
				exception: {
					type: 'java.lang.Error',
					frames: [{ className: 'java.lang.Error', methodName: 'get', fileName: '/home/player/secret.java' }],
				},
			},
		},
		{ ...submission(), report: { ...submission().report, breadcrumbs: [{ step: 'https://secret', elapsedMs: 0 }] } },
	]
	for (const body of invalid) {
		// biome-ignore lint/performance/noAwaitInLoops: malformed requests exercise identical device authentication in order.
		expect((await request(body, deviceToken, permit)).status).toBe(400)
	}
	const body = submission()
	const saved = await request(body, deviceToken, permit)
	expect(saved.status).toBe(201)
	expect(saved.headers.get('cache-control')).toBe('private, no-store')
	expect(await saved.json()).toEqual({ accepted: true, id: body.report.id, duplicate: false })
	expect((await request(body, deviceToken, permit)).status).toBe(200)
	expect((await request({ ...body, report: { ...body.report, phase: 'capture' } }, deviceToken, permit)).status).toBe(
		409
	)
	expect(
		(
			await request(
				{ ...submission(), report: { ...submission().report, occurredAt: '2100-01-01T00:00:00Z' } },
				deviceToken,
				permit
			)
		).status
	).toBe(400)
})
test('HTTP revocation deletes reports, invalidates in-flight permits and never permits an unauthenticated read', async () => {
	const first = pair()
	const second = pair()
	const permit = await enable(first.deviceToken)
	const secondPermit = await enable(second.deviceToken)
	expect((await request(submission(), first.deviceToken, permit)).status).toBe(201)
	expect((await request(submission(), second.deviceToken, secondPermit)).status).toBe(201)
	const deletion = await app.request('/api/mod/diagnostics', {
		method: 'DELETE',
		headers: { authorization: `Bearer ${first.deviceToken}` },
	})
	expect(await deletion.json()).toEqual({ deleted: 1 })
	expect((await request(submission(), first.deviceToken, permit)).status).toBe(403)
	const replacement = await enable(first.deviceToken)
	expect(replacement).not.toBe(permit)
	expect((await request(submission(), first.deviceToken, permit)).status).toBe(403)
	expect((await request(submission(), first.deviceToken, replacement)).status).toBe(201)
	expect(
		(await app.request('/api/mod/diagnostics', { headers: { authorization: `Bearer ${first.deviceToken}` } })).status
	).toBe(404)
	database.query('UPDATE devices SET revoked_at = ? WHERE id = ?').run(Date.now(), first.deviceId)
	expect((await request(submission(), first.deviceToken, replacement)).status).toBe(401)
	expect(
		(
			await app.request('/api/mod/diagnostics', {
				method: 'DELETE',
				headers: { authorization: `Bearer ${first.deviceToken}` },
			})
		).status
	).toBe(401)
	expect(
		database.query('SELECT COUNT(*) AS count FROM diagnostic_reports WHERE device_id = ?').get(second.deviceId)
	).toEqual({ count: 1 })
})
test('real streamed HTTP input is bounded without trusting content length; the endpoint rate limits', async () => {
	const { deviceToken } = pair()
	const permit = await enable(deviceToken)
	const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: fetchApi })
	try {
		const oversized = new ReadableStream({
			start(controller) {
				controller.enqueue(new Uint8Array(16_385))
				controller.close()
			},
		})
		const response = await fetch(new URL('/api/mod/diagnostics', server.url), {
			method: 'POST',
			body: oversized,
			headers: {
				authorization: `Bearer ${deviceToken}`,
				'content-type': 'application/json',
				'x-minemories-diagnostics-permit': permit,
			},
		})
		expect(response.status).toBe(413)
		const malformed = await app.request('/api/mod/diagnostics', {
			method: 'POST',
			body: '{',
			headers: { authorization: `Bearer ${deviceToken}` },
		})
		expect(malformed.status).toBe(400)
		for (let count = 0; count < 5; count++) {
			// biome-ignore lint/performance/noAwaitInLoops: the sixth request must observe the five committed reports.
			expect((await request(submission(), deviceToken, permit)).status).toBe(201)
		}
		const limited = await request(submission(), deviceToken, permit)
		expect(limited.status).toBe(429)
		expect(limited.headers.get('retry-after')).toBe('3600')
	} finally {
		await server.stop(true)
	}
})
test('consent input and activation bursts are bounded; disabled receivers still allow revocation', async () => {
	const { deviceToken } = pair()
	const headers = { authorization: `Bearer ${deviceToken}` }
	for (const body of ['{', '{"enabled":false}', '{"enabled":true,"token":"secret"}']) {
		// biome-ignore lint/performance/noAwaitInLoops: malformed activation attempts must not create permits.
		expect((await app.request('/api/mod/diagnostics/consent', { method: 'POST', body, headers })).status).toBe(400)
	}
	expect(
		(await app.request('/api/mod/diagnostics/consent', { method: 'POST', body: ' '.repeat(257), headers })).status
	).toBe(413)
	let permit = ''
	for (let count = 0; count < 5; count++) {
		// biome-ignore lint/performance/noAwaitInLoops: each activation replaces the previous permit.
		permit = await enable(deviceToken)
	}
	expect(
		(await app.request('/api/mod/diagnostics/consent', { method: 'POST', body: '{"enabled":true}', headers })).status
	).toBe(429)
	diagnostics.policy.enabled = false
	try {
		expect((await request(submission(), deviceToken, permit)).status).toBe(503)
		expect(
			(await app.request('/api/mod/diagnostics/consent', { method: 'POST', body: '{"enabled":true}', headers })).status
		).toBe(503)
		expect((await app.request('/api/mod/diagnostics', { method: 'DELETE', headers })).status).toBe(200)
	} finally {
		diagnostics.policy.enabled = true
	}
})
test('server errors strip messages, paths and unknown stack frames and require active opt-in permits', async () => {
	const { deviceId, deviceToken } = pair()
	const permit = await enable(deviceToken)
	const correlationId = randomUUID()
	const error = new TypeError('token secret https://private.example/world seed=123')
	error.stack = `TypeError: ${error.message}\n at storeMemory (/home/secret/minemories/apps/api/src/storage.ts:20:3)\n at tokenSecret (/private/account.ts:50:8)\n at secret/path (/private/uploads.ts:40:3)`
	expect(safeApiException(error)).toEqual({
		type: 'TypeError',
		frames: [{ className: 'dev.minemories.api', methodName: 'storeMemory', fileName: 'storage.ts', lineNumber: 20 }],
	})
	expect(safeApiException(null)).toEqual({ type: 'Error', frames: [] })
	expect(safeApiException(new RangeError()).type).toBe('RangeError')
	expect(safeApiException(new SyntaxError()).type).toBe('SyntaxError')
	const odd = new Error()
	Object.defineProperty(odd, 'stack', {
		get() {
			throw new Error('secret')
		},
	})
	expect(safeApiException(odd).frames).toEqual([])
	Object.defineProperty(odd, 'stack', { value: null })
	expect(safeApiException(odd).frames).toEqual([])
	const dense = new Error()
	dense.stack = `Error\n${Array.from({ length: 20 }, () => ' at write (/private/uploads.ts:2:4)').join('\n')}`
	expect(safeApiException(dense).frames).toHaveLength(12)
	const headers = {
		authorization: `Bearer ${deviceToken}`,
		'x-minemories-diagnostics-consent': 'true',
		'x-minemories-correlation': correlationId,
		'x-minemories-diagnostics-permit': permit,
	}
	const make = (change = {}) => new Request('http://localhost/api/mod/uploads', { headers: { ...headers, ...change } })
	for (const change of [
		{ 'x-minemories-diagnostics-consent': 'false' },
		{ 'x-minemories-correlation': 'secret' },
		{ authorization: '' },
		{ authorization: 'Bearer invalid' },
		{ 'x-minemories-diagnostics-permit': 'invalid' },
	])
		recordApiFailure(make(change), error)
	expect(database.query('SELECT COUNT(*) AS count FROM diagnostic_reports WHERE device_id = ?').get(deviceId)).toEqual({
		count: 0,
	})
	recordApiFailure(make(), error)
	const stored = database.query('SELECT report_json FROM diagnostic_reports WHERE device_id = ?').get(deviceId) as {
		report_json: string
	}
	expect(JSON.parse(stored.report_json)).toMatchObject({ source: 'api', correlationId, versions: { api: version } })
	expect(stored.report_json).not.toContain('secret')
	expect(stored.report_json).not.toContain('/home')
	diagnostics.purge(deviceId)
	recordApiFailure(make(), error)
	expect(database.query('SELECT COUNT(*) AS count FROM diagnostic_reports WHERE device_id = ?').get(deviceId)).toEqual({
		count: 0,
	})
	database.query('UPDATE devices SET revoked_at = ? WHERE id = ?').run(Date.now(), deviceId)
	recordApiFailure(make(), error)
	expect(requestCorrelation(make())).toBe(correlationId)
	expect(requestCorrelation(make({ 'x-minemories-correlation': 'token-secret' }))).toMatch(/^[0-9a-f-]{36}$/)
	const logger = spyOn(console, 'error').mockImplementation(() => undefined)
	try {
		logApiFailure('memory_upload_failed', correlationId)
		expect(JSON.parse(logger.mock.calls[0]?.[0] as string)).toEqual({
			level: 'error',
			event: 'memory_upload_failed',
			correlationId,
		})
		logApiFailure('request_failed')
		expect(logger.mock.calls[1]?.[0]).not.toContain('secret')
	} finally {
		logger.mockRestore()
	}
})

test('actual legacy and chunk upload failures persist only consented diagnostics with the client correlation', async () => {
	const { deviceId, deviceToken } = pair()
	const permit = await enable(deviceToken)
	const owner = database.query('SELECT user_id FROM devices WHERE id = ?').get(deviceId) as { user_id: string }
	mkdirSync(join(directory, 'objects'), { recursive: true })
	writeFileSync(join(directory, 'objects', owner.user_id), 'fixture obstructs object storage')
	const bytes = minimalGlb()
	const correlationId = randomUUID()
	const headers = {
		authorization: `Bearer ${deviceToken}`,
		'content-type': 'application/octet-stream',
		'x-minemories-correlation': correlationId,
		'x-minemories-diagnostics-consent': 'true',
		'x-minemories-diagnostics-permit': permit,
	}
	const logger = spyOn(console, 'error').mockImplementation(() => undefined)
	try {
		const refused = await app.request('/api/mod/memories', {
			method: 'POST',
			body: Uint8Array.from(bytes),
			headers: { ...headers, 'x-minemories-diagnostics-consent': 'false' },
		})
		expect(refused.status).toBe(503)
		expect(
			database.query('SELECT COUNT(*) AS count FROM diagnostic_reports WHERE device_id = ?').get(deviceId)
		).toEqual({ count: 0 })
		const response = await app.request('/api/mod/memories', { method: 'POST', body: Uint8Array.from(bytes), headers })
		expect(response.status).toBe(503)
		expect(response.headers.get('X-Minemories-Correlation')).toBe(correlationId)
		const id = randomUUID()
		const initialized = await app.request('/api/mod/uploads', {
			method: 'POST',
			headers: { ...headers, 'content-type': 'application/json' },
			body: JSON.stringify({ id, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }),
		})
		expect(initialized.status).toBe(201)
		const staged = join(directory, 'uploads', id)
		rmSync(staged)
		mkdirSync(staged)
		const chunk = await app.request(`/api/mod/uploads/${id}`, {
			method: 'PUT',
			body: Uint8Array.from(bytes),
			headers: { ...headers, 'Upload-Offset': '0' },
		})
		expect(chunk.status).toBe(503)
		const reports = database
			.query('SELECT report_json FROM diagnostic_reports WHERE device_id = ?')
			.all(deviceId) as Array<{ report_json: string }>
		expect(reports).toHaveLength(2)
		for (const row of reports) {
			expect(JSON.parse(row.report_json)).toMatchObject({ source: 'api', phase: 'upload', correlationId })
			expect(row.report_json).not.toContain(directory)
			expect(row.report_json).not.toContain(deviceToken)
			expect(row.report_json).not.toContain(owner.user_id)
		}
		for (const call of logger.mock.calls) {
			expect(call[0]).not.toContain(directory)
			expect(call[0]).not.toContain(deviceToken)
		}
	} finally {
		logger.mockRestore()
	}
})
