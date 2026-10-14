import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import type { ModDiagnostic } from '@minemories/api-contract'
import { diagnosticsPolicy } from './diagnostics-policy'
import { DiagnosticsStore } from './diagnostics-store'

function fixture(overrides = {}) {
	const database = new Database(':memory:')
	database.exec(
		"CREATE TABLE devices(id TEXT PRIMARY KEY, revoked_at INTEGER); INSERT INTO devices VALUES ('one', NULL), ('two', NULL)"
	)
	const store = new DiagnosticsStore(database, { ...diagnosticsPolicy({}), ...overrides })
	const now = Date.now()
	const permit = store.beginConsent('one', now) as string
	return { database, store, now, permit, device: { id: 'one', userId: 'owner' } }
}
function report(now: number): ModDiagnostic {
	return {
		id: randomUUID(),
		occurredAt: new Date(now).toISOString(),
		source: 'mod',
		phase: 'capture',
		versions: { mod: '0.1.0', minecraft: '1.21.1', loader: 'neoforge-21.1.248' },
		correlationId: randomUUID(),
		exception: {
			type: 'java.io.IOException',
			frames: [{ className: 'dev.minemories.core.GlbScene', methodName: 'write' }],
		},
		breadcrumbs: [{ step: 'capture_started', elapsedMs: 0 }],
	}
}
test('diagnostic policy rejects ambiguous, infinite and excessive limits', () => {
	expect(diagnosticsPolicy({}).retentionMs).toBe(14 * 86_400_000)
	expect(
		diagnosticsPolicy({ DIAGNOSTICS_ENABLED: 'false', DIAGNOSTICS_RETENTION_DAYS: '90', DIAGNOSTICS_PER_HOUR: '20' })
	).toMatchObject({ enabled: false, perHour: 20 })
	for (const environment of [
		{ DIAGNOSTICS_ENABLED: 'yes' },
		{ DIAGNOSTICS_MAX_REPORTS: '10001' },
		{ DIAGNOSTICS_MAX_PER_DEVICE: '0' },
		{ DIAGNOSTICS_RETENTION_DAYS: 'Infinity' },
		{ DIAGNOSTICS_PER_HOUR: '1.5' },
	])
		expect(() => diagnosticsPolicy(environment)).toThrow()
})
test('identity-scoped idempotency, fingerprinting and rate limits persist across store restarts', () => {
	const { database, store, device, permit, now } = fixture({ perHour: 2 })
	const first = report(now)
	expect(store.accept(device, first, permit, now)).toBe('accepted')
	expect(store.accept(device, first, permit, now)).toBe('duplicate')
	expect(store.accept(device, { ...first, phase: 'upload' }, permit, now)).toBe('conflict')
	expect(store.accept(device, { ...first, id: randomUUID(), correlationId: randomUUID() }, permit, now)).toBe(
		'accepted'
	)
	expect(store.accept(device, report(now), permit, now)).toBe('rate_limited')
	const restarted = new DiagnosticsStore(database, store.policy)
	expect(restarted.accept(device, report(now), permit, now)).toBe('rate_limited')
	expect(database.query('SELECT COUNT(DISTINCT fingerprint) AS count FROM diagnostic_reports').get()).toEqual({
		count: 1,
	})
	const other = { id: 'two', userId: 'other' }
	const otherPermit = store.beginConsent(other.id, now) as string
	expect(store.accept(other, first, otherPermit, now)).toBe('accepted')
	expect(store.accept(device, report(now + 3_600_000), permit, now + 3_600_000)).toBe('accepted')
	database.close()
})
test('retention, per-device and global quotas retain newest reports; purge is device scoped', () => {
	const { database, store, device, permit, now } = fixture({ perDevice: 2, global: 3, perHour: 20, retentionMs: 1000 })
	const first = report(now)
	store.accept(device, first, permit, now)
	store.accept(device, report(now + 1), permit, now + 1)
	store.accept(device, report(now + 2), permit, now + 2)
	expect(database.query('SELECT id FROM diagnostic_reports WHERE id = ?').get(first.id)).toBeNull()
	const other = { id: 'two', userId: 'other' }
	const otherPermit = store.beginConsent(other.id, now) as string
	store.accept(other, report(now + 3), otherPermit, now + 3)
	store.accept(other, report(now + 4), otherPermit, now + 4)
	expect(database.query('SELECT COUNT(*) AS count FROM diagnostic_reports').get()).toEqual({ count: 3 })
	expect(store.purge(device.id)).toBe(1)
	expect(store.accept(device, report(now), permit, now)).toBe('consent_required')
	expect(database.query('SELECT COUNT(*) AS count FROM diagnostic_reports').get()).toEqual({ count: 2 })
	store.cleanup(now + 1004)
	expect(database.query('SELECT COUNT(*) AS count FROM diagnostic_reports').get()).toEqual({ count: 0 })
	database.close()
})
test('revocation invalidates permits and cleans retained reports; consent refresh throttles independently', () => {
	const { database, store, device, permit, now } = fixture()
	store.accept(device, report(now), permit, now)
	for (let index = 0; index < 4; index++) expect(store.beginConsent(device.id, now)).not.toBeNull()
	expect(store.beginConsent(device.id, now)).toBeNull()
	expect(store.accept(device, report(now), permit, now)).toBe('consent_required')
	expect(store.beginConsent(device.id, now + 60_000)).not.toBeNull()
	database.query('UPDATE devices SET revoked_at = ? WHERE id = ?').run(now, device.id)
	expect(store.accept(device, report(now), permit, now)).toBe('unauthorized')
	expect(store.beginConsent(device.id, now)).toBeNull()
	store.cleanup(now)
	expect(database.query('SELECT COUNT(*) AS count FROM diagnostic_reports').get()).toEqual({ count: 0 })
	expect(database.query('SELECT COUNT(*) AS count FROM diagnostic_consents').get()).toEqual({ count: 0 })
	database.close()
})
test('disabled service and implausible times never persist a report', () => {
	const { database, store, device, permit, now } = fixture()
	expect(store.accept(device, report(now + 300_001), permit, now)).toBe('invalid_time')
	expect(store.accept(device, report(now - 91 * 86_400_000), permit, now)).toBe('invalid_time')
	expect(store.accept(device, { ...report(now), occurredAt: 'invalid' }, permit, now)).toBe('invalid_time')
	store.policy.enabled = false
	expect(store.accept(device, report(now), permit, now)).toBe('disabled')
	expect(store.beginConsent(device.id, now)).toBeNull()
	database.close()
})
