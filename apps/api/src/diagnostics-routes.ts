import { DIAGNOSTIC_BODY_BYTES, diagnosticSubmission } from '@minemories/api-contract'
import { Hono } from 'hono'
import * as z from 'zod'
import { requestBodyLimit } from './body-limits'
import { diagnostics } from './diagnostics-state'
import { getDeviceFromToken } from './pairing'

type Device = NonNullable<ReturnType<typeof getDeviceFromToken>>

export const diagnosticsRouter = new Hono<{ Variables: { device: Device } }>()
diagnosticsRouter.use('*', async (context, next) => {
	context.header('Cache-Control', 'private, no-store')
	const authorization = context.req.header('authorization') ?? ''
	const device = authorization.startsWith('Bearer ') ? getDeviceFromToken(authorization.slice(7)) : null
	if (!device) return context.json({ error: 'unauthorized' }, 401)
	context.set('device', device)
	return await next()
})
diagnosticsRouter.post('/consent', requestBodyLimit(256), async context => {
	let value: unknown
	try {
		value = await context.req.json()
	} catch {
		return context.json({ error: 'invalid_diagnostic_consent' }, 400)
	}
	if (!z.strictObject({ enabled: z.literal(true) }).safeParse(value).success)
		return context.json({ error: 'invalid_diagnostic_consent' }, 400)
	if (!diagnostics.policy.enabled) return context.json({ error: 'diagnostics_disabled' }, 503)
	const permit = diagnostics.beginConsent(context.get('device').id)
	if (!permit) return context.json({ error: 'diagnostics_consent_rate_limited' }, 429, { 'Retry-After': '60' })
	return context.json({ permit })
})
diagnosticsRouter.post('/', requestBodyLimit(DIAGNOSTIC_BODY_BYTES), async context => {
	let value: unknown
	try {
		value = await context.req.json()
	} catch {
		return context.json({ error: 'invalid_diagnostic' }, 400)
	}
	const parsed = diagnosticSubmission.safeParse(value)
	if (!parsed.success) return context.json({ error: 'invalid_diagnostic' }, 400)
	const result = diagnostics.accept(
		context.get('device'),
		parsed.data.report,
		context.req.header('x-minemories-diagnostics-permit') ?? ''
	)
	if (result === 'unauthorized') return context.json({ error: 'unauthorized' }, 401)
	if (result === 'consent_required') return context.json({ error: 'diagnostic_consent_required' }, 403)
	if (result === 'rate_limited')
		return context.json({ error: 'diagnostics_rate_limited' }, 429, { 'Retry-After': '3600' })
	if (result === 'disabled') return context.json({ error: 'diagnostics_disabled' }, 503)
	if (result === 'invalid_time') return context.json({ error: 'invalid_diagnostic' }, 400)
	if (result === 'conflict') return context.json({ error: 'diagnostic_id_conflict' }, 409)
	return context.json(
		{ accepted: true, id: parsed.data.report.id, duplicate: result === 'duplicate' },
		result === 'duplicate' ? 200 : 201
	)
})
diagnosticsRouter.delete('/', context => context.json({ deleted: diagnostics.purge(context.get('device').id) }))
