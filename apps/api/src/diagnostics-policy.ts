export interface DiagnosticsPolicy {
	enabled: boolean
	retentionMs: number
	perDevice: number
	global: number
	perHour: number
}
const integer = /^\d+$/
function boundedInteger(value: string | undefined, fallback: number, maximum: number): number {
	if (value === undefined) return fallback
	const result = Number(value)
	if (!(integer.test(value) && Number.isSafeInteger(result)) || result < 1 || result > maximum)
		throw new Error('Diagnostics limits must be positive integers within the documented bounds.')
	return result
}
export function diagnosticsPolicy(environment: Readonly<Record<string, string | undefined>>): DiagnosticsPolicy {
	if (environment.DIAGNOSTICS_ENABLED !== undefined && !['true', 'false'].includes(environment.DIAGNOSTICS_ENABLED))
		throw new Error('DIAGNOSTICS_ENABLED must be true or false.')
	return {
		enabled: environment.DIAGNOSTICS_ENABLED !== 'false',
		retentionMs: boundedInteger(environment.DIAGNOSTICS_RETENTION_DAYS, 14, 90) * 86_400_000,
		perDevice: boundedInteger(environment.DIAGNOSTICS_MAX_PER_DEVICE, 1000, 1000),
		global: boundedInteger(environment.DIAGNOSTICS_MAX_REPORTS, 10_000, 10_000),
		perHour: boundedInteger(environment.DIAGNOSTICS_PER_HOUR, 5, 20),
	}
}
