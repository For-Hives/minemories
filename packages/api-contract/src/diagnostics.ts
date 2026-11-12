import { oc } from '@orpc/contract'
import * as z from 'zod'

export const DIAGNOSTIC_BODY_BYTES = 16 * 1024
const javaClass =
	/^(?:dev\.minemories|net\.minecraft|net\.neoforged|com\.mojang|java|javax|com\.google\.gson)\.[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/
const javaMethod = /^(?:[A-Za-z_$][A-Za-z0-9_$]*|<init>|<clinit>)$/
const javaFile = /^[A-Za-z_$][A-Za-z0-9_$]*\.java$/
export const diagnosticPhase = z.enum(['capture', 'upload', 'pairing', 'crash', 'error'])
export const diagnosticStep = z.enum([
	'capture_requested',
	'capture_started',
	'capture_written',
	'capture_completed',
	'capture_failed',
	'upload_requested',
	'upload_started',
	'upload_session',
	'upload_chunk',
	'upload_completing',
	'upload_completed',
	'upload_failed',
	'pairing_started',
	'pairing_completed',
	'pairing_failed',
	'client_crashed',
	'error_handled',
])
const version = z
	.string()
	.min(1)
	.max(64)
	.regex(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/)
const code = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)
export const MAX_FRAMES = 24
export const MAX_BREADCRUMBS = 16
const javaType = z.string().min(1).max(160).regex(javaClass)
/** Request kinds of the chunked upload protocol; the HTTP error body is reduced to its `error` code. */
export const diagnosticHttp = z.strictObject({
	request: z.enum(['initialize', 'chunk', 'complete']),
	attempts: z.number().int().min(1).max(3),
	status: z.number().int().min(100).max(599).optional(),
	error: code.optional(),
	retryAfterSeconds: z.number().int().min(0).max(86_400).optional(),
})
/** Typed, bounded context only: never a message, a path, a name or a free-form string. */
export const diagnosticContext = z.strictObject({
	environment: z
		.strictObject({
			os: z.enum(['windows', 'macos', 'linux', 'other']),
			arch: z.string().regex(/^[a-z0-9_-]{1,16}$/),
			java: version,
			maxMemoryMb: z.number().int().min(0).max(1_048_576),
			processors: z.number().int().min(1).max(1024),
		})
		.optional(),
	http: diagnosticHttp.optional(),
	upload: z
		.strictObject({
			sizeBytes: z.number().int().min(0).max(10_000_000_000),
			offsetBytes: z.number().int().min(0).max(10_000_000_000),
			chunks: z.number().int().min(0).max(100_000),
		})
		.optional(),
	/** Classified reason of the failure (e.g. `scratch_symlink`), set where the failure is raised. */
	detail: code.optional(),
	/** Types of the wrapping exceptions, outermost first, the root cause excluded. */
	causes: z.array(javaType).max(6).optional(),
})
export type DiagnosticContext = z.infer<typeof diagnosticContext>
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
		frames: z.array(diagnosticFrame).max(MAX_FRAMES),
	}),
	breadcrumbs: z
		.array(
			z.strictObject({
				step: diagnosticStep,
				elapsedMs: z.number().int().min(0).max(86_400_000),
			})
		)
		.max(MAX_BREADCRUMBS),
	context: diagnosticContext.optional(),
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
			.max(MAX_FRAMES),
	}),
	breadcrumbs: z.tuple([]),
	/** What the API refused: the route and the HTTP status/error code, never the request content. */
	context: z.strictObject({ http: diagnosticHttp.omit({ attempts: true, retryAfterSeconds: true }) }).optional(),
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
