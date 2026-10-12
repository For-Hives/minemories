import type { StorageInspection } from './storage-inventory'
import { managedMemoryKey, type ObjectReferences } from './storage-references'

export const ORPHAN_GRACE_MS = 24 * 3_600_000

export interface DeletionClaim {
	user_id: string | null
	size: number | null
	discard_upload: number
}
export interface StorageCandidate extends StorageInspection {
	key: string
	job: DeletionClaim | null
}
export type ReconciliationAction = 'protected' | 'review' | 'recent' | 'repair' | 'queue' | 'unchanged' | 'gone'
export interface ReconciliationProposal {
	action: ReconciliationAction
	reason: string
	owner: string | null
	size: number | null
	discardUpload: boolean
}
function result(
	action: ReconciliationAction,
	reason: string,
	owner: string | null = null,
	size: number | null = null,
	discardUpload = true
): ReconciliationProposal {
	return { action, reason, owner, size, discardUpload }
}
function knownSize(candidate: StorageCandidate): number | null {
	return candidate.object?.size ?? (candidate.uploads.length ? null : 0)
}
function claimConflict(candidate: StorageCandidate, owner: string): string | null {
	const claim = candidate.job
	if (!claim) return null
	if (claim.user_id !== null && claim.user_id !== owner) return 'claim_owner_conflict'
	if (claim.size !== null && (!Number.isSafeInteger(claim.size) || claim.size < 0)) return 'invalid_claim_size'
	if (candidate.object && claim.size !== null && claim.size !== candidate.object.size) return 'claim_size_conflict'
	return null
}
function repairClaim(candidate: StorageCandidate, owner: string): ReconciliationProposal {
	const job = candidate.job as DeletionClaim
	const recovered = knownSize(candidate)
	const ownerValue = job.user_id ?? owner
	const size = job.size ?? recovered
	const discard = job.discard_upload === 1 || candidate.uploads.length > 0
	const changed =
		job.user_id === null || (job.size === null && recovered !== null) || Number(discard) !== job.discard_upload
	return result(
		changed ? 'repair' : 'unchanged',
		size === null ? 'size_unrecoverable' : 'existing_deletion',
		ownerValue,
		size,
		discard
	)
}

function orphanTiming(candidate: StorageCandidate, now: number): ReconciliationProposal | null {
	const dates = [candidate.object?.modified, ...candidate.uploads.map(upload => upload.created)]
	if (dates.some(date => date !== undefined && (date < 0 || !Number.isSafeInteger(date))))
		return result('review', 'invalid_storage_timestamp')
	return dates.some(date => date !== undefined && date > now - ORPHAN_GRACE_MS)
		? result('recent', 'orphan_grace_period')
		: null
}

export function classifyStorageCandidate(
	references: ObjectReferences,
	candidate: StorageCandidate,
	now: number
): ReconciliationProposal {
	if (references.isReferenced(candidate.key))
		return result('protected', candidate.job ? 'referenced_deletion_conflict' : 'referenced_capture_or_upload')
	const managed = managedMemoryKey(candidate.key)
	if (!(managed && references.knownOwner(managed.owner))) return result('review', 'unknown_key_or_owner')
	const conflict = claimConflict(candidate, managed.owner)
	if (conflict) return result('review', conflict)
	if (candidate.job) return repairClaim(candidate, managed.owner)
	if (!candidate.object && candidate.uploads.length === 0) return result('gone', 'object_already_absent')
	const timing = orphanTiming(candidate, now)
	if (timing) return timing
	const size = knownSize(candidate)
	return result('queue', size === null ? 'orphan_multipart_size_unknown' : 'orphan_object', managed.owner, size)
}
