/** A fresh document clears the old session cache after the server revoked every session. */
export function credentialChangeComplete(kind: 'email' | 'password'): void {
	window.location.assign(`/login?updated=${kind}`)
}
