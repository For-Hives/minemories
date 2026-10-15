import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import type { ApiDiagnostic, ModDiagnostic } from '@minemories/api-contract'
import { diagnosticsPolicy } from './diagnostics-policy'
import { DiagnosticsReview } from './diagnostics-review'
import { DiagnosticsStore } from './diagnostics-store'

function fixture() {
	const database = new Database(':memory:')
	database.exec('CREATE TABLE devices(id TEXT PRIMARY KEY, revoked_at INTEGER)')
	const store = new DiagnosticsStore(database, { ...diagnosticsPolicy({}), perHour: 20 })
	const review = new DiagnosticsReview(store, new Set(['operator']))
	function add(overrides: Partial<ModDiagnostic> = {}, deviceId = randomUUID()) {
		database.query('INSERT OR IGNORE INTO devices VALUES (?, NULL)').run(deviceId)
		const permit = store.beginConsent(deviceId) as string
		const report: ModDiagnostic = {
			id: randomUUID(),
			occurredAt: new Date().toISOString(),
			source: 'mod',
			phase: 'capture',
			versions: { mod: '0.2.1-beta.1', minecraft: '1.21.1', loader: 'neoforge-21.1.248' },
			correlationId: randomUUID(),
			exception: {
				type: 'java.io.IOException',
				frames: [{ className: 'dev.minemories.core.GlbScene', methodName: 'write' }],
			},
			breadcrumbs: [{ step: 'capture_failed', elapsedMs: 10 }],
			...overrides,
		}
		expect(store.accept({ id: deviceId, userId: 'player' }, report, permit)).toBe('accepted')
		return { report, deviceId, permit }
	}
	return { database, store, review, add }
}

test('operator permission is separate from gallery moderation and checked before every read or mutation', () => {
	const f = fixture()
	f.add()
	expect(f.review.allowed(null)).toBe(false)
	expect(f.review.allowed('gallery-moderator')).toBe(false)
	expect(f.review.allowed('operator')).toBe(true)
	for (const user of [null, 'player', 'gallery-moderator']) {
		expect(() => f.review.list(user, { state: 'all', page: 0 })).toThrow()
		expect(() => f.review.detail(user, 'a'.repeat(64), 0)).toThrow()
		expect(() => f.review.update(user, { fingerprint: 'a'.repeat(64), state: 'resolved', revision: 1 })).toThrow()
	}
	f.database.close()
})

test('groups duplicate failures with full sanitized details; filters select the correct version, phase and source', () => {
	const f = fixture()
	f.add()
	f.add({ versions: { mod: '0.1.0', minecraft: '1.21.1', loader: 'neoforge-21.1.248' } })
	f.add({ phase: 'crash', breadcrumbs: [{ step: 'client_crashed', elapsedMs: 0 }] })
	const groups = f.review.list('operator', { state: 'open', page: 0 })
	expect(groups.items).toHaveLength(2)
	const capture = groups.items.find(item => item.lastReport.phase === 'capture') as (typeof groups.items)[number]
	expect(capture).toMatchObject({ count: 2, devices: 2, state: 'open', revision: 2 })
	expect(
		f.review.list('operator', { state: 'open', version: '0.2.1-beta.1', phase: 'capture', source: 'mod', page: 0 })
			.items[0]
	).toMatchObject({ count: 1, lastReport: { versions: { mod: '0.2.1-beta.1' } } })
	expect(f.review.list('operator', { state: 'all', version: 'nonexistent', page: 0 }).items).toHaveLength(0)
	expect(f.review.list('operator', { state: 'all', source: 'api', page: 0 }).items).toHaveLength(0)
	const detail = f.review.detail('operator', capture.fingerprint, 0)
	expect(detail.items).toHaveLength(2)
	expect(detail.items[0]?.report.exception.type).toBe('java.io.IOException')
	expect(detail.hasMore).toBe(false)
	expect(() => f.review.detail('operator', 'a'.repeat(64), 0)).toThrow('Not Found')
	f.database.close()
})

test('triage persists across restarts, rejects stale edits, reopens resolved recurrences and retains ignored status', () => {
	const f = fixture()
	const added = f.add()
	const first = f.review.list('operator', { state: 'all', page: 0 }).items[0] as NonNullable<
		ReturnType<typeof f.review.list>['items'][number]
	>
	expect(
		f.review.update('operator', { fingerprint: first.fingerprint, state: 'resolved', revision: first.revision })
	).toEqual({ ok: true })
	expect(f.review.list('operator', { state: 'open', page: 0 }).items).toHaveLength(0)
	expect(() =>
		f.review.update('operator', { fingerprint: first.fingerprint, state: 'ignored', revision: first.revision })
	).toThrow('Diagnostics changed')
	const restarted = new DiagnosticsStore(f.database, f.store.policy)
	const otherReview = new DiagnosticsReview(restarted, new Set(['operator']))
	expect(otherReview.detail('operator', first.fingerprint, 0).issue.state).toBe('resolved')
	f.add()
	const recurrence = otherReview.detail('operator', first.fingerprint, 0).issue
	expect(recurrence.state).toBe('open')
	expect(() => otherReview.update('operator', { ...first, state: 'resolved' })).toThrow()
	otherReview.update('operator', { ...recurrence, state: 'in_progress' })
	let current = otherReview.detail('operator', first.fingerprint, 0).issue
	expect(current.state).toBe('in_progress')
	otherReview.update('operator', { ...current, state: 'ignored' })
	f.add()
	current = otherReview.detail('operator', first.fingerprint, 0).issue
	expect(current.state).toBe('ignored')
	expect(restarted.accept({ id: added.deviceId, userId: 'player' }, added.report, added.permit)).toBe('duplicate')
	expect(otherReview.detail('operator', first.fingerprint, 0).issue.revision).toBe(current.revision)
	expect(() => otherReview.update('operator', { fingerprint: 'a'.repeat(64), state: 'resolved', revision: 1 })).toThrow(
		'Not Found'
	)
	f.database.close()
})

test('group and occurrence pagination are bounded and deterministic', () => {
	const f = fixture()
	for (let index = 0; index < 27; index++)
		f.add({
			exception: {
				type: 'java.io.IOException',
				frames: [{ className: 'dev.minemories.core.GlbScene', methodName: `write${index}` }],
			},
		})
	expect(f.review.list('operator', { state: 'all', page: 0 })).toMatchObject({ hasMore: true })
	expect(f.review.list('operator', { state: 'all', page: 0 }).items).toHaveLength(25)
	expect(f.review.list('operator', { state: 'all', page: 1 }).items).toHaveLength(2)
	for (let index = 0; index < 22; index++) f.add()
	const group = f.review.list('operator', { state: 'all', page: 0 }).items.find(item => item.count === 22)
	expect(group).toBeTruthy()
	const id = group?.fingerprint as string
	expect(f.review.detail('operator', id, 0)).toMatchObject({ hasMore: true })
	expect(f.review.detail('operator', id, 0).items).toHaveLength(20)
	expect(f.review.detail('operator', id, 1).items).toHaveLength(2)
	f.database.close()
})

test('withdrawal, revoked devices and retention remove reports and orphan triage metadata', () => {
	const f = fixture()
	const a = f.add()
	const b = f.add()
	f.store.purge(a.deviceId)
	expect(f.review.list('operator', { state: 'all', page: 0 }).items[0]?.count).toBe(1)
	f.database.query('UPDATE devices SET revoked_at = ? WHERE id = ?').run(Date.now(), b.deviceId)
	expect(f.review.list('operator', { state: 'all', page: 0 }).items).toHaveLength(0)
	expect(f.database.query('SELECT COUNT(*) AS count FROM diagnostic_issues').get()).toEqual({ count: 0 })
	f.add()
	f.database.query('UPDATE diagnostic_reports SET received_at = 1').run()
	expect(f.review.list('operator', { state: 'all', page: 0 }).items).toHaveLength(0)
	expect(f.database.query('SELECT COUNT(*) AS count FROM diagnostic_issues').get()).toEqual({ count: 0 })
	f.database.close()
})

test('existing API reports migrate into triage and preserve the actual API version', () => {
	const f = fixture()
	const { deviceId, permit } = f.add()
	const report: ApiDiagnostic = {
		id: randomUUID(),
		occurredAt: new Date().toISOString(),
		source: 'api',
		phase: 'upload',
		versions: { api: '0.2.1-beta.1' },
		correlationId: randomUUID(),
		exception: {
			type: 'TypeError',
			frames: [{ className: 'dev.minemories.api', methodName: 'storeMemory', fileName: 'storage.ts', lineNumber: 42 }],
		},
		breadcrumbs: [],
	}
	expect(f.store.accept({ id: deviceId, userId: 'player' }, report, permit)).toBe('accepted')
	f.database.exec('DELETE FROM diagnostic_issues')
	new DiagnosticsStore(f.database, f.store.policy)
	const result = f.review.list('operator', { state: 'all', source: 'api', version: '0.2.1-beta.1', page: 0 })
	expect(result.items[0]?.lastReport).toEqual(report)
	f.database.close()
})
