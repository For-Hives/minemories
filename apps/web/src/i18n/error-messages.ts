const codes: Record<string, string> = {
	UNAUTHORIZED: 'Sign in again to continue.',
	FORBIDDEN: 'You do not have permission for this action.',
	NOT_FOUND: 'This item is unavailable or was removed.',
	TOO_MANY_REQUESTS: 'Too many attempts. Wait a moment and try again.',
	BAD_REQUEST: 'Check the entered information and try again.',
	CONFLICT: 'This item changed. Refresh the page and try again.',
	SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Try again.',
	INTERNAL_SERVER_ERROR: 'The service is temporarily unavailable. Try again.',
	INVALID_EMAIL_OR_PASSWORD: 'Invalid email or password.',
	INVALID_PASSWORD: 'Invalid email or password.',
	USER_ALREADY_EXISTS: 'Email already used',
	EMAIL_NOT_VERIFIED: 'Verify your email address before signing in.',
	PASSWORD_TOO_SHORT: 'The password does not meet the requirements.',
}
export const stableErrorMessages: Record<string, string> = Object.fromEntries(
	[
		'Invalid email or password.',
		'Invalid email or password',
		'Email already used',
		'Choose a .glb file',
		'A model is already loading',
		'Could not read this GLB',
		'Invalid GLB',
		'Invalid or overly complex GLB. Export a smaller area with embedded textures and geometry.',
		'Storage unavailable',
		'This memory is unavailable or access was revoked.',
		'This link was stopped by the person who shared it.',
		'The scene could not be loaded. Try again in a moment.',
		'Restoration information could not be loaded. Try again.',
		'WebGL is unavailable. Try another browser or enable hardware acceleration.',
	].map(message => [message, message])
)

/** Store stable message keys, so changing language also updates an error already on screen. */
export function errorMessageKey(error: unknown, fallback: string): string {
	if (!error || typeof error !== 'object') return fallback
	const record = error as { message?: unknown; code?: unknown }
	const message =
		typeof record.message === 'string' && Object.hasOwn(stableErrorMessages, record.message)
			? stableErrorMessages[record.message]
			: undefined
	if (message) return message
	const code = typeof record.code === 'string' && Object.hasOwn(codes, record.code) ? codes[record.code] : undefined
	return code ?? fallback
}
