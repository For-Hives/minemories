import type { Database } from 'bun:sqlite'
import type { StorageInventory } from './storage-inventory'
import {
	classifyStorageCandidate,
	type DeletionClaim,
	type ReconciliationProposal,
	type StorageCandidate,
} from './storage-reconciliation'
import { ObjectReferences } from './storage-references'

export const MAX_RECONCILIATION_ITEMS = 50_000
export const MAX_RECONCILIATION_BYTES = 32 * 1024 * 1024
const ownerPrefix = /^[a-z0-9_-]{1,128}\/$/i

export interface ReconciliationEntry {
	candidate: StorageCandidate
	proposal: ReconciliationProposal
}
export interface ReconciliationPlan {
	version: 1
	createdAt: number
	databasePath: string
	storageId: string
	prefix: string
	entries: ReconciliationEntry[]
}
export interface PlanOptions {
	databasePath: string
	prefix?: string
	now?: number
}
class InventoryBudget {
	private count = 0
	private bytes = 0
	claim(value: unknown) {
		this.count++
		this.bytes += Buffer.byteLength(JSON.stringify(value))
		if (this.count > MAX_RECONCILIATION_ITEMS || this.bytes > MAX_RECONCILIATION_BYTES)
			throw new Error('Storage inventory exceeds plan limits; inventory one owner prefix at a time.')
	}
}
function candidateFor(candidates: Map<string, StorageCandidate>, key: string, prefix: string): StorageCandidate {
	if (!key.startsWith(prefix)) throw new Error('Storage inventory escaped its requested prefix.')
	let value = candidates.get(key)
	if (!value) {
		value = { key, object: null, uploads: [], job: null }
		candidates.set(key, value)
	}
	return value
}
function addJobs(
	database: Database,
	candidates: Map<string, StorageCandidate>,
	budget: InventoryBudget,
	prefix: string
) {
	const jobs = database
		.query(`SELECT object_key, user_id, size, discard_upload FROM object_deletions
			WHERE ? = '' OR substr(object_key, 1, length(?)) = ? LIMIT ?`)
		.all(prefix, prefix, prefix, MAX_RECONCILIATION_ITEMS + 1) as Array<DeletionClaim & { object_key: string }>
	for (const job of jobs) {
		budget.claim(job)
		candidateFor(candidates, job.object_key, prefix).job = {
			user_id: job.user_id,
			size: job.size,
			discard_upload: job.discard_upload,
		}
	}
}
async function inventoryCandidates(database: Database, inventory: StorageInventory, prefix: string) {
	const budget = new InventoryBudget()
	const candidates = new Map<string, StorageCandidate>()
	const uploadIds = new Map<string, Set<string>>()
	for await (const object of inventory.objects(prefix)) {
		budget.claim(object)
		const candidate = candidateFor(candidates, object.key, prefix)
		if (candidate.object) throw new Error('Duplicate object in storage inventory.')
		candidate.object = object
	}
	for await (const upload of inventory.uploads(prefix)) {
		budget.claim(upload)
		const candidate = candidateFor(candidates, upload.key, prefix)
		const seen = uploadIds.get(upload.key) ?? new Set<string>()
		if (seen.has(upload.id)) throw new Error('Duplicate multipart upload in storage inventory.')
		seen.add(upload.id)
		uploadIds.set(upload.key, seen)
		candidate.uploads.push(upload)
	}
	addJobs(database, candidates, budget, prefix)
	return candidates
}

export async function collectReconciliationPlan(
	database: Database,
	inventory: StorageInventory,
	options: PlanOptions
): Promise<ReconciliationPlan> {
	const prefix = options.prefix ?? ''
	if (prefix && !ownerPrefix.test(prefix)) throw new Error('Inventory prefix must be one owner namespace ending in /.')
	const now = options.now ?? Date.now()
	if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid inventory time.')
	const storageId = await inventory.identity()
	const candidates = await inventoryCandidates(database, inventory, prefix)
	const references = new ObjectReferences(database)
	const entries = [...candidates.values()]
		.sort((left, right) => left.key.localeCompare(right.key))
		.map(candidate => ({ candidate, proposal: classifyStorageCandidate(references, candidate, now) }))
	const plan: ReconciliationPlan = {
		version: 1,
		createdAt: now,
		databasePath: options.databasePath,
		storageId,
		prefix,
		entries,
	}
	if (Buffer.byteLength(JSON.stringify(plan)) > MAX_RECONCILIATION_BYTES)
		throw new Error('Storage inventory exceeds plan size; inventory one owner prefix at a time.')
	return plan
}
