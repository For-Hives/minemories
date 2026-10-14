import * as z from 'zod'

export const DIAGNOSTIC_BODY_BYTES = 16 * 1024
const javaClass =
	/^(?:dev\.minemories|net\.minecraft|net\.neoforged|com\.mojang|java|javax|com\.google\.gson)\.[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/
const javaMethod = /^(?:[A-Za-z_$][A-Za-z0-9_$]*|<init>|<clinit>)$/
const javaFile = /^[A-Za-z_$][A-Za-z0-9_$]*\.java$/
export const diagnosticPhase = z.enum(['capture', 'upload', 'pairing'])
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
