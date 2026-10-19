import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

function key(secret: string) {
	return createHash('sha256').update('minemories-share-token-v1:').update(secret).digest()
}
/** Keep owner-recoverable links encrypted at rest, bound to their owner and capture. */
export function sealShareToken(token: string, secret: string, identity: string): string {
	const nonce = randomBytes(12)
	const cipher = createCipheriv('aes-256-gcm', key(secret), nonce)
	cipher.setAAD(Buffer.from(identity))
	const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()])
	return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url')
}
export function openShareToken(value: string | null, secret: string, identity: string): string | null {
	if (!value) return null
	try {
		const data = Buffer.from(value, 'base64url')
		const cipher = createDecipheriv('aes-256-gcm', key(secret), data.subarray(0, 12))
		cipher.setAAD(Buffer.from(identity))
		cipher.setAuthTag(data.subarray(12, 28))
		return Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString('utf8')
	} catch {
		return null
	}
}
