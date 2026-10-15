import { oc } from '@orpc/contract'
import * as z from 'zod'

export const DIAGNOSTIC_BODY_BYTES = 16 * 1024
const javaClass =
	/^(?:dev\.minemories|net\.minecraft|net\.neoforged|com\.mojang|java|javax|com\.google\.gson)\.[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/
const javaMethod = /^(?:[A-Za-z_$][A-Za-z0-9_$]*|<init>|<clinit>)$/
const javaFile = /^[A-Za-z_$][A-Za-z0-9_$]*\.java$/
export const diagnosticPhase = z.enum(['capture', 'upload', 'pairing', 'crash'])
export const diagnosticStep = z.enum([
	'capture_requested',
	'capture_started',
	'capture_written',
	'capture_completed',
	'capture_failed',
	'upload_requested',
	'upload_started',
	'upload_chunk',
	'upload_completed',
	'upload_failed',
	'pairing_started',
	'pairing_completed',
	'pairing_failed',
	'client_crashed',
])
const version = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/)
export const diagnosticFrame = z.strictObject({
	className: z.string().min(1).max(160).regex(javaClass),
	methodName: z.string().min(1).max(80).regex(javaMethod),
	fileName: z.string().max(80).regex(javaFile).optional(),
	lineNumber: z.number().int().min(0).max(10_000_000).optional(),
})
export const diagnosticReport = z.strictObject({
	id: z.string().uuid(),
	occurredAt: z.string().datetime(),
	source: z.literal('mod'),
	phase: diagnosticPhase,
	versions: z.strictObject({ mod: version, minecraft: version, loader: version }),
	correlationId: z.string().uuid(),
	exception: z.strictObject({
		type: z.string().min(1).max(160).regex(javaClass),
		frames: z.array(diagnosticFrame).max(12),
	}),
	breadcrumbs: z
		.array(
			z.strictObject({
				step: diagnosticStep,
				elapsedMs: z.number().int().min(0).max(86_400_000),
			})
		)
		.max(8),
})
export const diagnosticSubmission = z.strictObject({ consent: z.literal(true), report: diagnosticReport })
export type ModDiagnostic = z.infer<typeof diagnosticReport>

export const apiDiagnosticReport = z.strictObject({
	id: z.string().uuid(),
	occurredAt: z.string().datetime(),
	source: z.literal('api'),
	phase: z.literal('upload'),
	versions: z.strictObject({ api: version }),
	correlationId: z.string().uuid(),
	exception: z.strictObject({
		type: z.enum(['Error', 'TypeError', 'RangeError', 'SyntaxError']),
		frames: z
			.array(
				z.strictObject({
					className: z.literal('dev.minemories.api'),
					methodName: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]{0,79}$/),
					fileName: z
						.string()
						.regex(/^[a-z-]+\.ts$/)
						.optional(),
					lineNumber: z.number().int().min(0).max(10_000_000).optional(),
				})
			)
			.max(12),
	}),
	breadcrumbs: z.tuple([]),
})
export type ApiDiagnostic = z.infer<typeof apiDiagnosticReport>
export const storedDiagnostic = z.discriminatedUnion('source', [diagnosticReport, apiDiagnosticReport])
export const diagnosticIssueState = z.enum(['open', 'in_progress', 'resolved', 'ignored'])
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/)
const page = z.number().int().min(0).max(500).default(0)
const issue = z.object({
	fingerprint,
	state: diagnosticIssueState,
	revision: z.number().int().positive(),
	count: z.number().int().positive(),
	devices: z.number().int().positive(),
	firstReceivedAt: z.number().int(),
	lastReceivedAt: z.number().int(),
	updatedAt: z.number().int().nullable(),
	lastReport: storedDiagnostic,
})
export const diagnosticsContract = {
	access: oc.output(z.object({ allowed: z.boolean() })),
	list: oc
		.input(
			z.object({
				state: z.enum(['all', ...diagnosticIssueState.options]).default('open'),
				phase: diagnosticPhase.optional(),
				source: z.enum(['mod', 'api']).optional(),
				version: version.optional(),
				page,
			})
		)
		.output(z.object({ items: z.array(issue), hasMore: z.boolean() })),
	detail: oc.input(z.object({ fingerprint, page })).output(
		z.object({
			issue,
			items: z.array(z.object({ deviceId: z.string().uuid(), receivedAt: z.number().int(), report: storedDiagnostic })),
			hasMore: z.boolean(),
		})
	),
	update: oc
		.input(z.object({ fingerprint, state: diagnosticIssueState, revision: z.number().int().positive() }))
		.output(z.object({ ok: z.literal(true) })),
}
