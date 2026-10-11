import { DAY_MS, TRASH_RETENTION_MS } from '@minemories/api-contract'

export function daysUntilPurge(deletedAt: string, purgeAt?: string, now = Date.now()): number | null {
	const deadline = purgeAt === undefined ? Date.parse(deletedAt) + TRASH_RETENTION_MS : Date.parse(purgeAt)
	if (!Number.isFinite(deadline)) return null
	return Math.max(0, Math.ceil((deadline - now) / DAY_MS))
}
