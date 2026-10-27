import { randomUUID } from 'node:crypto'
import { version } from '../package.json'
import { diagnostics } from './diagnostics-state'
import type { ApiDiagnostic } from './diagnostics-store'
import { getDeviceFromToken } from './pairing'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const method = /^[A-Za-z_$][A-Za-z0-9_$]{0,79}$/
const stackFunction = /^\s*at (?:async )?([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/
const sourceFile =
	/(?:^|\/)(index|uploads|upload-files|storage|storage-s3|storage-stream|object-deletions)\.ts:(\d+):\d+\)?$/
type ErrorEvent =
	| 'billing_auth_failed'
	| 'rpc_failed'
	| 'shared_download_failed'
	| 'public_download_failed'
	| 'memory_download_failed'
	| 'memory_upload_failed'
	| 'chunk_upload_failed'
	| 'upload_cleanup_failed'
	| 'request_failed'
	| 'diagnostics_failed'

export function requestCorrelation(request: Request): string {
	const supplied = request.headers.get('x-minemories-correlation') ?? ''
	return uuid.test(supplied) ? supplied.toLowerCase() : randomUUID()
}
export function logApiFailure(event: ErrorEvent, correlationId: string = randomUUID()): void {
	console.error(JSON.stringify({ level: 'error', event, correlationId }))
}
function exceptionType(error: unknown): ApiDiagnostic['exception']['type'] {
	if (error instanceof TypeError) return 'TypeError'
	if (error instanceof RangeError) return 'RangeError'
	if (error instanceof SyntaxError) return 'SyntaxError'
	return 'Error'
}
export function safeApiException(error: unknown): ApiDiagnostic['exception'] {
	const result: ApiDiagnostic['exception'] = { type: exceptionType(error), frames: [] }
	if (!(error instanceof Error)) return result
	let stack: string | undefined
	try {
		stack = error.stack
	} catch {
		return result
	}
	if (typeof stack !== 'string') return result
	for (const line of stack.slice(0, 8192).split('\n').slice(1, 33)) {
		const location = sourceFile.exec(line)
		if (!location) continue
		const functionName = stackFunction.exec(line)?.[1]
		if (!(functionName && method.test(functionName))) continue
		const lineNumber = Number(location[2])
		if (lineNumber > 10_000_000) continue
		result.frames.push({
			className: 'dev.minemories.api',
			methodName: functionName,
			fileName: `${location[1]}.ts`,
			lineNumber,
		})
		if (result.frames.length === 12) break
	}
	return result
}
export function recordApiFailure(request: Request, error: unknown): void {
	if (request.headers.get('x-minemories-diagnostics-consent') !== 'true') return
	const correlationId = request.headers.get('x-minemories-correlation') ?? ''
	if (!uuid.test(correlationId)) return
	const authorization = request.headers.get('authorization') ?? ''
	if (!authorization.startsWith('Bearer ')) return
	const permit = request.headers.get('x-minemories-diagnostics-permit') ?? ''
	if (!uuid.test(permit)) return
	try {
		const device = getDeviceFromToken(authorization.slice(7))
		if (!device) return
		diagnostics.accept(
			device,
			{
				id: randomUUID(),
				occurredAt: new Date().toISOString(),
				source: 'api',
				phase: 'upload',
				versions: { api: version },
				correlationId: correlationId.toLowerCase(),
				exception: safeApiException(error),
				breadcrumbs: [],
			},
			permit
		)
	} catch {
		// Reporting must never hide the original failure or log potentially sensitive exception details.
		logApiFailure('diagnostics_failed')
	}
}
