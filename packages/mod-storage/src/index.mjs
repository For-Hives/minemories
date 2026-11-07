// S3 storage for the mod JARs (self-hosted distribution). Bucket layout:
//   mods/<targetId>/<version>/<jar>[.sha256|manifest.json]   kept versions
//   latest/<targetId>.jar                                    stable copy of the latest version
//   index.json                                               written LAST, atomically
// All these keys live under `MOD_STORAGE_PREFIX` (empty by default); the index keeps them relative.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CopyObjectCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	UploadPartCommand,
} from '@aws-sdk/client-s3'
import { createClient, ensureBucket, isNotFound, storageSettings } from './client.mjs'

export { DEFAULT_MOD_BUCKET, parseModPrefix, storageSettings } from './client.mjs'

/**
 * @typedef {{ modrinth?: string, curseforge?: string }} PublishedLinks
 * @typedef {{ version: string, builtAt: string, commit: string, bytes: number, sha256: string,
 *   key: string, builtBy?: 'pc' | 'vps', pinned?: boolean, published?: PublishedLinks }} IndexVersion
 * @typedef {{ loader: string, minecraft: string, loaderVersion: string, java: string, fabricApi?: string,
 *   latest: string, versions: IndexVersion[] }} IndexTarget
 * @typedef {{ schema: 1, generatedAt: string, targets: Record<string, IndexTarget> }} ModIndex
 */

export const INDEX_KEY = 'index.json'
export const PART_SIZE = 8 * 1024 * 1024
const targetIdPattern = /^([a-z]+)-mc([0-9][\w.]*)$/
const versionPattern = /^[0-9][\w.+-]*$/
const sha256Pattern = /^[a-f0-9]{64}$/
/** Machine that built the JAR: the owner's PC or the VPS (bytes may differ between the two). */
export const BUILT_BY = ['pc', 'vps']

export const jarName = (targetId, version) => `minemories-${targetId}-${version}.jar`
export const versionPrefix = (targetId, version) => `mods/${targetId}/${version}/`
export const versionKey = (targetId, version) => `${versionPrefix(targetId, version)}${jarName(targetId, version)}`
export const latestKey = targetId => `latest/${targetId}.jar`

/**
 * Context of an operation. Every key handled in this file is RELATIVE to the prefix (`MOD_STORAGE_PREFIX`);
 * `at()` is the only place where the prefix is added before an S3 call, listings included, which are bounded
 * to the prefix. The index therefore stores relative keys: changing the prefix (or removing it) does not break
 * an index moved along with its objects.
 */
function context({ env = process.env, client } = {}) {
	const { bucket, prefix } = storageSettings(env)
	return { env, client: client ?? createClient(env), bucket, prefix }
}

/** A safe relative key: non-empty, no leading `/`, no `//`, no `.` or `..` segment, no backslash. */
export function isSafeKey(key) {
	return (
		typeof key === 'string' &&
		key.length > 0 &&
		key.length <= 1024 &&
		!key.includes('\\') &&
		!key.split('/').some(segment => segment === '.' || segment === '..' || segment === '')
	)
}

/** Absolute bucket key for `key` relative to `prefix`, or `null` when `key` falls outside `roots`. */
export function resolveObjectKey(prefix, key, roots = ['mods/', 'latest/']) {
	return isSafeKey(key) && roots.some(root => key.startsWith(root) && key.length > root.length)
		? `${prefix}${key}`
		: null
}

function at(ctx, key) {
	if (!isSafeKey(key)) throw new Error(`Storage key rejected: ${JSON.stringify(key)}`)
	return `${ctx.prefix}${key}`
}

/** Only keys under `mods/` can be deleted. */
function removable(key) {
	if (!(key.startsWith('mods/') && isSafeKey(key))) throw new Error(`Refusing to delete outside mods/: ${key}`)
	return key
}

export function emptyIndex() {
	return { schema: 1, generatedAt: new Date().toISOString(), targets: {} }
}

/** Version order: newest first (build date, then numeric comparison). */
export function compareVersions(a, b) {
	const time = Date.parse(b.builtAt) - Date.parse(a.builtAt)
	if (time) return time
	return b.version.localeCompare(a.version, 'en', { numeric: true })
}

export function validateIndex(value) {
	if (!value || typeof value !== 'object' || value.schema !== 1 || typeof value.targets !== 'object' || !value.targets)
		throw new Error('index.json is invalid (expected schema 1).')
	for (const [id, target] of Object.entries(value.targets)) {
		if (!(Array.isArray(target?.versions) && target.versions.length > 0 && typeof target.latest === 'string'))
			throw new Error(`index.json is invalid for ${id}.`)
		for (const entry of target.versions)
			if (
				!(
					sha256Pattern.test(entry.sha256) &&
					Number.isSafeInteger(entry.bytes) &&
					resolveObjectKey('', entry.key, ['mods/']) !== null &&
					(entry.builtBy === undefined || BUILT_BY.includes(entry.builtBy))
				)
			)
				throw new Error(`index.json is invalid for ${id} ${entry.version}.`)
	}
	return value
}

async function bodyBuffer(body) {
	const chunks = []
	for await (const chunk of body) chunks.push(Buffer.from(chunk))
	return Buffer.concat(chunks)
}

async function readObject(ctx, key) {
	const response = await ctx.client.send(new GetObjectCommand({ Bucket: ctx.bucket, Key: at(ctx, key) }))
	return bodyBuffer(response.Body)
}

async function head(ctx, key) {
	try {
		return await ctx.client.send(new HeadObjectCommand({ Bucket: ctx.bucket, Key: at(ctx, key) }))
	} catch (error) {
		if (isNotFound(error)) return null
		throw error
	}
}

async function readIndexIn(ctx) {
	let raw
	try {
		raw = await readObject(ctx, INDEX_KEY)
	} catch (error) {
		if (isNotFound(error)) return emptyIndex()
		throw error
	}
	return validateIndex(JSON.parse(raw.toString('utf8')))
}

/** Current index; an empty bucket or one without an index yields an empty index. */
export function readIndex({ env = process.env, client } = {}) {
	return readIndexIn(context({ env, client }))
}

async function writeIndex(ctx, index) {
	const next = { ...index, schema: 1, generatedAt: new Date().toISOString() }
	await ctx.client.send(
		new PutObjectCommand({
			Bucket: ctx.bucket,
			Key: at(ctx, INDEX_KEY),
			Body: Buffer.from(`${JSON.stringify(next, null, 2)}\n`),
			ContentType: 'application/json',
			CacheControl: 'no-cache',
		})
	)
	return next
}

async function listObjects(ctx, prefix) {
	const objects = []
	let token
	do {
		const page = await ctx.client.send(
			new ListObjectsV2Command({ Bucket: ctx.bucket, Prefix: `${ctx.prefix}${prefix}`, ContinuationToken: token })
		)
		// Belt and braces: a key outside the prefix is never counted nor returned (so never deleted).
		for (const item of page.Contents ?? [])
			if (item.Key?.startsWith(ctx.prefix) && item.Key.length > ctx.prefix.length)
				objects.push({ key: item.Key.slice(ctx.prefix.length), bytes: item.Size ?? 0 })
		token = page.IsTruncated ? page.NextContinuationToken : undefined
	} while (token)
	return objects
}

async function hashFile(file) {
	const hash = createHash('sha256')
	for await (const chunk of createReadStream(file)) hash.update(chunk)
	return hash.digest('hex')
}

async function putMultipart(ctx, key, file, size, partSize, metadata) {
	const created = await ctx.client.send(
		new CreateMultipartUploadCommand({
			Bucket: ctx.bucket,
			Key: at(ctx, key),
			ContentType: 'application/java-archive',
			Metadata: metadata,
		})
	)
	const handle = await open(file, 'r')
	try {
		const parts = []
		for (let offset = 0, number = 1; offset < size; offset += partSize, number += 1) {
			const body = Buffer.alloc(Math.min(partSize, size - offset))
			await handle.read(body, 0, body.length, offset)
			const part = await ctx.client.send(
				new UploadPartCommand({
					Bucket: ctx.bucket,
					Key: at(ctx, key),
					UploadId: created.UploadId,
					PartNumber: number,
					Body: body,
					ContentLength: body.length,
				})
			)
			parts.push({ ETag: part.ETag, PartNumber: number })
		}
		await ctx.client.send(
			new CompleteMultipartUploadCommand({
				Bucket: ctx.bucket,
				Key: at(ctx, key),
				UploadId: created.UploadId,
				MultipartUpload: { Parts: parts },
			})
		)
	} catch (error) {
		await ctx.client
			.send(new AbortMultipartUploadCommand({ Bucket: ctx.bucket, Key: at(ctx, key), UploadId: created.UploadId }))
			.catch(() => undefined)
		throw error
	} finally {
		await handle.close()
	}
}

async function putFile(ctx, key, file, { contentType, metadata, partSize = PART_SIZE }) {
	const { size } = await stat(file)
	if (size > partSize) return putMultipart(ctx, key, file, size, partSize, metadata)
	const body = await readFile(file)
	await ctx.client.send(
		new PutObjectCommand({
			Bucket: ctx.bucket,
			Key: at(ctx, key),
			Body: body,
			ContentLength: body.length,
			ContentType: contentType,
			Metadata: metadata,
		})
	)
}

/** Reads the uploaded object back and compares size and digest with the source file. */
async function verifyUpload(ctx, key, bytes, sha256) {
	const response = await ctx.client.send(new GetObjectCommand({ Bucket: ctx.bucket, Key: at(ctx, key) }))
	const hash = createHash('sha256')
	let size = 0
	for await (const chunk of response.Body) {
		hash.update(chunk)
		size += chunk.length
	}
	if (size !== bytes || hash.digest('hex') !== sha256)
		throw new Error(`sha256 verification failed after uploading ${key}.`)
}

function targetMetadata(config, targetId) {
	const list = Array.isArray(config?.targets) ? config.targets : Object.values(config?.targets ?? {})
	const found = list.find(item => item?.id === targetId)
	const match = targetIdPattern.exec(targetId)
	return {
		loader: found?.loader ?? match[1],
		minecraft: found?.minecraft ?? match[2],
		loaderVersion: String(found?.loaderVersion ?? ''),
		java: String(found?.java ?? ''),
		...(found?.fabricApi ? { fabricApi: found.fabricApi } : {}),
	}
}

function assertSafe(targetId, version) {
	if (!(targetIdPattern.test(targetId) && versionPattern.test(version)))
		throw new Error(`Target or version is invalid: ${targetId} ${version}`)
}

async function uploadSidecars(ctx, artifact, targetId, version, sha256) {
	const prefix = versionPrefix(targetId, version)
	const sidecars = [
		[`${artifact.file}.sha256`, `${jarName(targetId, version)}.sha256`, 'text/plain'],
		[join(dirname(artifact.file), 'manifest.json'), 'manifest.json', 'application/json'],
	]
	for (const [path, name, contentType] of sidecars) {
		try {
			await putFile(ctx, `${prefix}${name}`, path, { contentType, metadata: { sha256 } })
		} catch (error) {
			if (error?.code !== 'ENOENT') throw error
		}
	}
}

async function storeArtifact(ctx, { targetId, version, artifact, partSize }) {
	const key = versionKey(targetId, version)
	const sha256 = await hashFile(artifact.file)
	const bytes = (await stat(artifact.file)).size
	if (artifact.sha256 && artifact.sha256 !== sha256) throw new Error(`Unexpected sha256 for ${artifact.file}.`)
	if (artifact.bytes && artifact.bytes !== bytes) throw new Error(`Unexpected size for ${artifact.file}.`)
	const existing = await head(ctx, key)
	if (!(existing && existing.ContentLength === bytes && existing.Metadata?.sha256 === sha256)) {
		await putFile(ctx, key, artifact.file, { contentType: 'application/java-archive', metadata: { sha256 }, partSize })
		await verifyUpload(ctx, key, bytes, sha256)
	}
	await uploadSidecars(ctx, artifact, targetId, version, sha256)
	return { key, bytes, sha256 }
}

function mergeVersion(current, meta, entry) {
	const previous = current?.versions.find(item => item.version === entry.version)
	const merged = {
		...entry,
		...(previous?.pinned ? { pinned: true } : {}),
		...(previous?.published ? { published: previous.published } : {}),
	}
	const versions = [...(current?.versions ?? []).filter(item => item.version !== entry.version), merged].sort(
		compareVersions
	)
	return { ...meta, latest: versions[0].version, versions }
}

/**
 * Uploads a complete release. The index is only rewritten once every object (and the `latest/` copies)
 * is present and verified: a failure midway leaves the index intact.
 * @param {{ config: object, version: string, commit: string, builtAt: string,
 *   artifacts: { targetId: string, file: string, bytes?: number, sha256?: string, builtBy?: 'pc' | 'vps' }[],
 *   env?: Record<string, string|undefined>, client?: object, partSize?: number }} options
 * @returns {Promise<{ index: ModIndex }>}
 */
export async function storeRelease({
	config,
	version,
	commit,
	builtAt,
	artifacts,
	env = process.env,
	client,
	partSize,
}) {
	for (const artifact of artifacts) assertSafe(artifact.targetId, version)
	const ctx = context({ env, client })
	await ensureBucket(ctx.client, env)
	const index = await readIndexIn(ctx)
	const targets = { ...index.targets }
	const stored = []
	for (const artifact of artifacts)
		stored.push({
			targetId: artifact.targetId,
			result: await storeArtifact(ctx, { targetId: artifact.targetId, version, artifact, partSize }),
		})
	for (const { targetId, result } of stored) {
		const builtBy = artifacts.find(artifact => artifact.targetId === targetId)?.builtBy
		const entry = {
			version,
			builtAt,
			commit,
			bytes: result.bytes,
			sha256: result.sha256,
			key: result.key,
			...(builtBy ? { builtBy } : {}),
		}
		targets[targetId] = mergeVersion(targets[targetId], targetMetadata(config, targetId), entry)
		if (targets[targetId].latest !== version) continue
		await ctx.client.send(
			new CopyObjectCommand({
				Bucket: ctx.bucket,
				Key: at(ctx, latestKey(targetId)),
				CopySource: `${ctx.bucket}/${at(ctx, result.key)}`,
				MetadataDirective: 'REPLACE',
				ContentType: 'application/java-archive',
				Metadata: { sha256: result.sha256, version },
			})
		)
	}
	return { index: await writeIndex(ctx, { ...index, targets }) }
}

export class ModStorageConflictError extends Error {
	constructor(message) {
		super(message)
		this.name = 'ModStorageConflictError'
	}
}

/**
 * Stores a received JAR (uploaded through the API) with the same logic as `storeRelease`, then applies retention.
 * - same version, same bytes: nothing is written (`unchanged`);
 * - same version, different bytes: rejected (`ModStorageConflictError`) unless `replace`;
 * - after a successful upload, `pruneStorage({ keep, dryRun: false })`: never `latest`, pinned or published.
 * Callers must serialize calls (a single index writer at a time).
 * @param {{ target: { id: string, loader: string, minecraft: string, loaderVersion: string, java: string,
 *   fabricApi?: string }, version: string, commit: string, builtAt: string, builtBy?: 'pc' | 'vps',
 *   file: string, bytes: number, sha256: string, replace?: boolean, keep?: number,
 *   env?: Record<string, string|undefined>, client?: object, partSize?: number }} options
 * @returns {Promise<{ latest: boolean, replaced: boolean, unchanged: boolean, index: ModIndex }>}
 */
export async function storeUpload({
	target,
	version,
	commit,
	builtAt,
	builtBy,
	file,
	bytes,
	sha256,
	replace = false,
	keep = 3,
	env = process.env,
	client,
	partSize,
}) {
	assertSafe(target.id, version)
	const ctx = context({ env, client })
	const current = await readIndexIn(ctx)
	const existing = current.targets[target.id]?.versions.find(item => item.version === version)
	const sameBytes = existing?.sha256 === sha256 && existing.bytes === bytes
	if (existing && !sameBytes && !replace)
		throw new ModStorageConflictError(`Version ${version} of ${target.id} already exists with different content.`)
	if (sameBytes && (await head(ctx, existing.key))?.ContentLength === bytes)
		return { latest: current.targets[target.id].latest === version, replaced: false, unchanged: true, index: current }
	await storeRelease({
		config: { targets: [target] },
		version,
		commit,
		builtAt,
		artifacts: [{ targetId: target.id, file, bytes, sha256, ...(builtBy ? { builtBy } : {}) }],
		env,
		client: ctx.client,
		partSize,
	})
	await pruneStorage({ keep, dryRun: false, env, client: ctx.client })
	const index = await readIndexIn(ctx)
	return { latest: index.targets[target.id].latest === version, replaced: Boolean(existing), unchanged: false, index }
}

async function updateEntry({ targetId, version, env, client }, change) {
	const ctx = context({ env, client })
	const index = await readIndexIn(ctx)
	const entry = index.targets[targetId]?.versions.find(item => item.version === version)
	if (!entry) throw new Error(`Version not found: ${targetId} ${version}`)
	change(entry)
	return writeIndex(ctx, index)
}

/** Pins or unpins a version (the flag lives in the index). */
export function setPinned({ targetId, version, pinned, env = process.env, client }) {
	return updateEntry({ targetId, version, env, client }, entry => {
		if (pinned) entry.pinned = true
		else delete entry.pinned
	})
}

/** Records the links of a third-party publication (Modrinth, CurseForge): the version becomes untouchable. */
export function setPublished({ targetId, version, links, env = process.env, client }) {
	return updateEntry({ targetId, version, env, client }, entry => {
		entry.published = { ...entry.published, ...links }
	})
}

function keptReason(entry, target, rank, keep) {
	if (entry.version === target.latest) return 'latest'
	if (entry.pinned) return 'pinned'
	if (entry.published && Object.values(entry.published).some(Boolean)) return 'published'
	return rank < keep ? 'recent' : null
}

/**
 * Retention: keeps the `keep` newest versions of each target, plus the `latest` version, pinned versions
 * and those referenced by a third-party publication. The index is rewritten BEFORE objects are deleted
 * (an orphaned object is harmless, an index pointing at nothing is not).
 */
export async function pruneStorage({ keep = 3, dryRun = true, env = process.env, client } = {}) {
	if (!(Number.isInteger(keep) && keep >= 1)) throw new Error('keep must be an integer >= 1.')
	const ctx = context({ env, client })
	const index = await readIndexIn(ctx)
	const deleted = []
	const kept = []
	const targets = {}
	for (const [targetId, target] of Object.entries(index.targets)) {
		const survivors = []
		for (const [rank, entry] of [...target.versions].sort(compareVersions).entries()) {
			const reason = keptReason(entry, target, rank, keep)
			if (reason) {
				survivors.push(entry)
				kept.push({ targetId, version: entry.version, key: entry.key, bytes: entry.bytes, reason })
				continue
			}
			for (const object of await listObjects(ctx, versionPrefix(targetId, entry.version)))
				deleted.push({ targetId, version: entry.version, ...object })
		}
		targets[targetId] = { ...target, versions: survivors }
	}
	const freedBytes = deleted.reduce((total, item) => total + item.bytes, 0)
	if (!dryRun && deleted.length > 0) {
		await writeIndex(ctx, { ...index, targets })
		for (const item of deleted)
			await ctx.client.send(new DeleteObjectCommand({ Bucket: ctx.bucket, Key: at(ctx, removable(item.key)) }))
	}
	return { deleted, kept, freedBytes }
}

/** Bucket usage: total (all objects) and breakdown per target. */
export async function storageReport({ env = process.env, client } = {}) {
	const ctx = context({ env, client })
	const index = await readIndexIn(ctx)
	const objects = await listObjects(ctx, '')
	const perTarget = {}
	for (const [id, target] of Object.entries(index.targets)) {
		const prefix = `mods/${id}/`
		perTarget[id] = {
			versions: target.versions.length,
			bytes: objects.filter(object => object.key.startsWith(prefix)).reduce((total, object) => total + object.bytes, 0),
			latest: target.latest,
		}
	}
	return { totalBytes: objects.reduce((total, object) => total + object.bytes, 0), perTarget }
}
