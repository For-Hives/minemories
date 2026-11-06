// Faux client S3 en mémoire pour les tests : pas de réseau. `failOn(command)` permet de simuler une panne.
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'

function notFound(name = 'NotFound') {
	return Object.assign(new Error(name), { name, $metadata: { httpStatusCode: 404 } })
}

export function createFakeClient({ failOn } = {}) {
	const objects = new Map()
	const uploads = new Map()
	const calls = []
	let bucketExists = false
	const handlers = {
		HeadBucketCommand() {
			if (!bucketExists) throw notFound()
			return {}
		},
		CreateBucketCommand() {
			bucketExists = true
			return {}
		},
		HeadObjectCommand({ Key }) {
			const object = objects.get(Key)
			if (!object) throw notFound()
			return { ContentLength: object.body.length, Metadata: object.metadata, ContentType: object.contentType }
		},
		GetObjectCommand({ Key }) {
			const object = objects.get(Key)
			if (!object) throw notFound('NoSuchKey')
			return { Body: Readable.from([object.body]), ContentLength: object.body.length }
		},
		PutObjectCommand({ Key, Body, ContentType, Metadata }) {
			objects.set(Key, { body: Buffer.from(Body), contentType: ContentType, metadata: Metadata ?? {} })
			return {}
		},
		CopyObjectCommand({ Key, CopySource, Metadata, ContentType }) {
			const source = objects.get(CopySource.slice(CopySource.indexOf('/') + 1))
			if (!source) throw notFound('NoSuchKey')
			objects.set(Key, { body: source.body, contentType: ContentType, metadata: Metadata ?? {} })
			return {}
		},
		DeleteObjectCommand({ Key }) {
			objects.delete(Key)
			return {}
		},
		ListObjectsV2Command({ Prefix = '', ContinuationToken }) {
			const keys = [...objects.keys()].filter(key => key.startsWith(Prefix)).sort()
			const start = ContinuationToken ? Number(ContinuationToken) : 0
			const page = keys.slice(start, start + 2)
			const truncated = start + 2 < keys.length
			return {
				Contents: page.map(Key => ({ Key, Size: objects.get(Key).body.length })),
				IsTruncated: truncated,
				NextContinuationToken: truncated ? String(start + 2) : undefined,
			}
		},
		CreateMultipartUploadCommand({ Key, Metadata, ContentType }) {
			const UploadId = `upload-${uploads.size + 1}`
			uploads.set(UploadId, { Key, Metadata, ContentType, parts: new Map() })
			return { UploadId }
		},
		UploadPartCommand({ UploadId, PartNumber, Body }) {
			uploads.get(UploadId).parts.set(PartNumber, Buffer.from(Body))
			return { ETag: `"${PartNumber}"` }
		},
		CompleteMultipartUploadCommand({ UploadId }) {
			const upload = uploads.get(UploadId)
			const body = Buffer.concat([...upload.parts.entries()].sort((a, b) => a[0] - b[0]).map(entry => entry[1]))
			objects.set(upload.Key, { body, contentType: upload.ContentType, metadata: upload.Metadata ?? {} })
			uploads.delete(UploadId)
			return {}
		},
		AbortMultipartUploadCommand({ UploadId }) {
			uploads.delete(UploadId)
			return {}
		},
	}
	return {
		objects,
		uploads,
		calls,
		sha256: key => createHash('sha256').update(objects.get(key).body).digest('hex'),
		send(command) {
			const type = command.constructor.name
			calls.push({ type, input: command.input })
			if (failOn?.(type, command.input)) return Promise.reject(new Error(`panne simulée sur ${type}`))
			const handler = handlers[type]
			if (!handler) return Promise.reject(new Error(`commande non gérée : ${type}`))
			try {
				return Promise.resolve(handler(command.input))
			} catch (error) {
				return Promise.reject(error)
			}
		},
	}
}
