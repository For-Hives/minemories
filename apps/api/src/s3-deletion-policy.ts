import { DeleteObjectCommand, GetBucketVersioningCommand, type S3Client } from '@aws-sdk/client-s3'

export async function assertUnversionedBucket(client: S3Client, bucket: string, signal?: AbortSignal): Promise<void> {
	const result = await client.send(
		new GetBucketVersioningCommand({ Bucket: bucket }),
		signal ? { abortSignal: signal } : {}
	)
	if (result.Status) throw new Error('Cold storage requires a bucket that has never enabled versioning.')
}

/** Retain durable cleanup claims if the provider only creates a delete marker instead of erasing private data. */
export async function deleteS3Object(
	client: S3Client,
	bucket: string,
	key: string,
	provider: 'aws' | 'r2' | null
): Promise<void> {
	if (provider === 'aws') await assertUnversionedBucket(client, bucket)
	const result = await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
	if (result.DeleteMarker || result.VersionId)
		throw new Error('S3 deletion retained object versions; cleanup is not confirmed.')
}
