import { open, writeFile } from 'node:fs/promises'
import * as z from 'zod'
import {
	MAX_RECONCILIATION_BYTES,
	MAX_RECONCILIATION_ITEMS,
	type ReconciliationPlan,
} from './storage-reconciliation-plan'

const text = z.string().min(1).max(4096)
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const object = z.strictObject({ key: text, size: integer, modified: integer, etag: text })
const upload = z.strictObject({ key: text, id: text, created: integer })
const claim = z.strictObject({
	user_id: text.nullable(),
	size: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).nullable(),
	discard_upload: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
})
const candidate = z.strictObject({
	key: text,
	object: object.nullable(),
	uploads: z.array(upload).max(MAX_RECONCILIATION_ITEMS),
	job: claim.nullable(),
})
const proposal = z.strictObject({
	action: z.enum(['protected', 'review', 'recent', 'repair', 'queue', 'unchanged', 'gone']),
	reason: text,
	owner: text.nullable(),
	size: integer.nullable(),
	discardUpload: z.boolean(),
})
const schema = z.strictObject({
	version: z.literal(1),
	createdAt: integer,
	databasePath: text,
	storageId: z.string().regex(/^[a-f0-9]{64}$/),
	prefix: z.string().regex(/^(?:[a-z0-9_-]{1,128}\/)?$/i),
	entries: z.array(z.strictObject({ candidate, proposal })).max(MAX_RECONCILIATION_ITEMS),
})

function coherent(plan: ReconciliationPlan): boolean {
	const keys = new Set<string>()
	let records = 0
	for (const { candidate } of plan.entries) {
		if (keys.has(candidate.key) || !candidate.key.startsWith(plan.prefix)) return false
		keys.add(candidate.key)
		if (candidate.object && candidate.object.key !== candidate.key) return false
		const uploads = new Set<string>()
		for (const upload of candidate.uploads) {
			if (upload.key !== candidate.key || uploads.has(upload.id)) return false
			uploads.add(upload.id)
		}
		records += Math.max(
			1,
			Number(candidate.object !== null) + candidate.uploads.length + Number(candidate.job !== null)
		)
		if (records > MAX_RECONCILIATION_ITEMS) return false
	}
	return true
}
export function validateReconciliationPlan(value: unknown): ReconciliationPlan {
	const result = schema.safeParse(value)
	if (!(result.success && coherent(result.data))) throw new Error('Invalid reconciliation plan.')
	return result.data
}

export async function writeReconciliationPlan(path: string, plan: ReconciliationPlan): Promise<void> {
	const parsed = validateReconciliationPlan(plan)
	const bytes = Buffer.from(JSON.stringify(parsed))
	if (bytes.length > MAX_RECONCILIATION_BYTES) throw new Error('Reconciliation plan exceeds its size limit.')
	await writeFile(path, bytes, { flag: 'wx', mode: 0o600 })
}
export async function readReconciliationPlan(path: string): Promise<ReconciliationPlan> {
	const file = await open(path, 'r')
	try {
		const info = await file.stat()
		if (!info.isFile() || info.size > MAX_RECONCILIATION_BYTES) throw new Error('Invalid reconciliation plan file.')
		const chunks: Buffer[] = []
		let size = 0
		while (true) {
			const chunk = Buffer.alloc(64 * 1024)
			// biome-ignore lint/performance/noAwaitInLoops: Bound bytes actually read, including files growing after stat.
			const { bytesRead } = await file.read(chunk)
			if (bytesRead === 0) break
			size += bytesRead
			if (size > MAX_RECONCILIATION_BYTES) throw new Error('Reconciliation plan exceeds its size limit.')
			chunks.push(chunk.subarray(0, bytesRead))
		}
		const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
		return validateReconciliationPlan(JSON.parse(text))
	} finally {
		await file.close()
	}
}
