import { Readable } from 'node:stream'
import {
	AbortMultipartUploadCommand,
	type BucketLocationConstraint,
	CreateBucketCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadBucketCommand,
	ListMultipartUploadsCommand,
	S3Client,
	S3ServiceException,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { DEV_S3_ACCESS_KEY, DEV_S3_SECRET_KEY } from './configuration'

const bucket = process.env.S3_BUCKET ?? 'minemories'
const region = process.env.S3_REGION ?? 'garage'
const client = new S3Client({
	endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:3900',
	region,
	forcePathStyle: true,
	maxAttempts: 3,
	requestHandler: { connectionTimeout: 15_000, socketTimeout: 30_000 },
	credentials: {
		accessKeyId: process.env.S3_ACCESS_KEY ?? DEV_S3_ACCESS_KEY,
		secretAccessKey: process.env.S3_SECRET_KEY ?? DEV_S3_SECRET_KEY,
	},
	// Garage does not implement the SDK's optional CRC checksum extensions.
	requestChecksumCalculation: 'WHEN_REQUIRED',
	responseChecksumValidation: 'WHEN_REQUIRED',
})
let bucketReady: Promise<void> | undefined

async function ensureBucket() {
	bucketReady ??= (async () => {
		try {
			await client.send(new HeadBucketCommand({ Bucket: bucket }))
		} catch (error) {
			if (!(error instanceof S3ServiceException) || error.$metadata.httpStatusCode !== 404) throw error
			await client.send(
				new CreateBucketCommand({
					Bucket: bucket,
					// Compatible providers can have region names outside AWS's enum.
					CreateBucketConfiguration:
						region === 'us-east-1' ? undefined : { LocationConstraint: region as BucketLocationConstraint },
				})
			)
		}
	})().catch((error: unknown) => {
		bucketReady = undefined
		throw error
	})
	await bucketReady
}

export async function uploadS3Memory(objectKey: string, contents: Buffer | Readable, size: number) {
	await ensureBucket()
	await new Upload({
		client,
		params: { Bucket: bucket, Key: objectKey, Body: contents, ContentLength: size, ContentType: 'model/gltf-binary' },
		partSize: 8 * 1024 * 1024,
		queueSize: 1,
		// The durable SQLite deletion job cleans up parts after errors and process crashes.
		leavePartsOnError: true,
	}).done()
}

export async function removeS3Memory(objectKey: string) {
	await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }))
}

export async function readS3MemoryStream(objectKey: string): Promise<Readable> {
	const { Body } = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }))
	if (!(Body instanceof Readable)) throw new Error('Invalid S3 object stream.')
	return Body
}

async function* incompleteUploads(objectKey: string) {
	let keyMarker: string | undefined
	let uploadIdMarker: string | undefined
	const seenMarkers = new Set<string>()
	while (true) {
		// biome-ignore lint/performance/noAwaitInLoops: Each page needs the preceding response's two markers.
		const page = await client.send(
			new ListMultipartUploadsCommand({
				Bucket: bucket,
				Prefix: objectKey,
				KeyMarker: keyMarker,
				UploadIdMarker: uploadIdMarker,
			})
		)
		yield page.Uploads ?? []
		if (!page.IsTruncated) return
		const marker = JSON.stringify([page.NextKeyMarker, page.NextUploadIdMarker])
		if (!page.NextKeyMarker || seenMarkers.has(marker)) throw new Error('Invalid S3 multipart pagination.')
		seenMarkers.add(marker)
		keyMarker = page.NextKeyMarker
		uploadIdMarker = page.NextUploadIdMarker
	}
}

export async function discardS3MemoryUpload(objectKey: string) {
	await ensureBucket()
	for await (const uploads of incompleteUploads(objectKey)) {
		for (const upload of uploads) {
			if (upload.Key !== objectKey) continue
			if (!upload.UploadId) throw new Error('Invalid S3 multipart upload identifier.')
			// biome-ignore lint/performance/noAwaitInLoops: Bound provider concurrency and finish aborts before object deletion.
			await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: objectKey, UploadId: upload.UploadId }))
		}
	}
	await removeS3Memory(objectKey)
}
