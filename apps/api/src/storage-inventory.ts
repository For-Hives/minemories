import { createHash } from 'node:crypto'
import { lstat, opendir, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
	HeadObjectCommand,
	ListMultipartUploadsCommand,
	ListObjectsV2Command,
	S3ServiceException,
} from '@aws-sdk/client-s3'
import { s3Target } from './storage-s3'

export interface InventoryObject {
	key: string
	size: number
	modified: number
	etag: string
}
export interface InventoryUpload {
	key: string
	id: string
	created: number
}
export interface StorageInspection {
	object: InventoryObject | null
	uploads: InventoryUpload[]
}
export interface StorageInventory {
	identity(): Promise<string>
	objects(prefix: string): AsyncIterable<InventoryObject>
	uploads(prefix: string): AsyncIterable<InventoryUpload> | Iterable<InventoryUpload>
	inspect(key: string): Promise<StorageInspection>
}
function fingerprint(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
function text(value: unknown): string {
	if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 4096)
		throw new Error('Invalid storage inventory metadata.')
	return value
}
function date(value: Date | undefined): number {
	const time = value?.getTime()
	if (time === undefined || !Number.isSafeInteger(time) || time < 0)
		throw new Error('Invalid storage inventory timestamp.')
	return time
}
function object(
	key: string,
	size: number | undefined,
	modified: Date | undefined,
	etag: string | undefined
): InventoryObject {
	if (size === undefined || !Number.isSafeInteger(size) || size < 0) throw new Error('Invalid storage inventory size.')
	return { key: text(key), size, modified: date(modified), etag: text(etag) }
}
export class S3Inventory implements StorageInventory {
	private readonly target = s3Target()
	identity(): Promise<string> {
		return Promise.resolve(fingerprint(['s3', this.target.endpoint, this.target.bucket]))
	}
	async *objects(prefix: string): AsyncGenerator<InventoryObject> {
		let token: string | undefined
		const seen = new Set<string>()
		while (true) {
			// biome-ignore lint/performance/noAwaitInLoops: Each listing page depends on its preceding continuation token.
			const page = await this.target.client.send(
				new ListObjectsV2Command({
					Bucket: this.target.bucket,
					Prefix: prefix,
					MaxKeys: 1000,
					ContinuationToken: token,
				})
			)
			for (const item of page.Contents ?? []) yield object(text(item.Key), item.Size, item.LastModified, item.ETag)
			if (!page.IsTruncated) return
			token = text(page.NextContinuationToken)
			if (seen.has(token)) throw new Error('Invalid storage inventory pagination.')
			seen.add(token)
		}
	}
	async *uploads(prefix: string): AsyncGenerator<InventoryUpload> {
		let keyMarker: string | undefined
		let uploadIdMarker: string | undefined
		const seen = new Set<string>()
		while (true) {
			// biome-ignore lint/performance/noAwaitInLoops: Multipart pagination requires both markers from the preceding page.
			const page = await this.target.client.send(
				new ListMultipartUploadsCommand({
					Bucket: this.target.bucket,
					Prefix: prefix,
					MaxUploads: 1000,
					KeyMarker: keyMarker,
					UploadIdMarker: uploadIdMarker,
				})
			)
			for (const item of page.Uploads ?? [])
				yield { key: text(item.Key), id: text(item.UploadId), created: date(item.Initiated) }
			if (!page.IsTruncated) return
			keyMarker = text(page.NextKeyMarker)
			uploadIdMarker = text(page.NextUploadIdMarker)
			const marker = JSON.stringify([keyMarker, uploadIdMarker])
			if (seen.has(marker)) throw new Error('Invalid storage inventory pagination.')
			seen.add(marker)
		}
	}
	async inspect(key: string): Promise<StorageInspection> {
		let found: InventoryObject | null = null
		try {
			const header = await this.target.client.send(new HeadObjectCommand({ Bucket: this.target.bucket, Key: key }))
			found = object(key, header.ContentLength, header.LastModified, header.ETag)
		} catch (error) {
			if (!(error instanceof S3ServiceException) || error.$metadata.httpStatusCode !== 404) throw error
		}
		const uploads: InventoryUpload[] = []
		for await (const upload of this.uploads(key)) {
			if (upload.key === key) uploads.push(upload)
			if (uploads.length > 1000) throw new Error('Too many abandoned uploads for one object.')
		}
		return { object: found, uploads }
	}
}
function missing(error: unknown): boolean {
	return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
export class FilesystemInventory implements StorageInventory {
	private readonly root: string
	constructor(root: string) {
		this.root = resolve(root)
	}
	async identity(): Promise<string> {
		const canonical = await realpath(this.root)
		const info = await lstat(canonical)
		if (!info.isDirectory()) throw new Error('Storage inventory root must be an existing directory.')
		return fingerprint(['filesystem', canonical, info.dev, info.ino])
	}
	async *objects(prefix: string): AsyncGenerator<InventoryObject> {
		await this.identity()
		for await (const key of this.keys(this.root, '', prefix)) {
			const found = (await this.inspect(key)).object
			if (found) yield found
		}
	}
	uploads(): InventoryUpload[] {
		return []
	}
	async inspect(key: string): Promise<StorageInspection> {
		await this.identity()
		const path = resolve(this.root, key)
		const inside = relative(this.root, path)
		if (isAbsolute(key) || !inside || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside))
			throw new Error('Invalid storage inventory key.')
		try {
			await this.parents(inside)
			const info = await lstat(path)
			if (!info.isFile()) throw new Error('Storage inventory refuses non-regular files.')
			return {
				object: {
					key,
					size: info.size,
					modified: Math.floor(info.mtimeMs),
					etag: fingerprint([info.dev, info.ino, info.size, info.mtimeMs]),
				},
				uploads: [],
			}
		} catch (error) {
			if (missing(error)) return { object: null, uploads: [] }
			throw error
		}
	}
	private async parents(inside: string): Promise<void> {
		let current = this.root
		for (const part of inside.split(sep).slice(0, -1)) {
			current = join(current, part)
			// biome-ignore lint/performance/noAwaitInLoops: Refuse every symbolic-link ancestor before inspecting a file.
			if (!(await lstat(current)).isDirectory()) throw new Error('Storage inventory refuses non-directory ancestors.')
		}
	}
	private async *keys(folder: string, base: string, prefix: string, depth = 0): AsyncGenerator<string> {
		if (depth > 32) throw new Error('Storage inventory directory depth exceeded.')
		const entries = await opendir(folder)
		for await (const entry of entries) {
			const key = base + entry.name
			if (!base && prefix && !prefix.startsWith(`${entry.name}/`)) continue
			if (entry.isSymbolicLink()) throw new Error('Storage inventory refuses symbolic links.')
			if (entry.isDirectory()) yield* this.keys(join(folder, entry.name), `${key}/`, prefix, depth + 1)
			else if (key.startsWith(prefix)) yield key
		}
	}
}

export function storageInventory(): StorageInventory {
	switch (process.env.STORAGE_DRIVER ?? 's3') {
		case 'filesystem':
			return new FilesystemInventory(process.env.LOCAL_OBJECTS_PATH ?? './data/objects')
		case 's3':
			return new S3Inventory()
		default:
			throw new Error('STORAGE_DRIVER must be either "s3" or "filesystem".')
	}
}
