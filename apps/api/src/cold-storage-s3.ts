import {
	CopyObjectCommand,
	HeadObjectCommand,
	type HeadObjectCommandOutput,
	RestoreObjectCommand,
	type S3Client,
	S3ServiceException,
} from '@aws-sdk/client-s3'
import type { ColdStorageWork } from './cold-storage-catalog'
import type { ColdStorageTarget } from './cold-storage-target'
import type { ColdStorageProvider } from './cold-storage-worker'
import { assertUnversionedBucket } from './s3-deletion-policy'
import { managedMemoryKey } from './storage-references'
import type { TierCopy } from './tier-locations'

const MAX_COPY_BYTES = 200 * 1024 * 1024
const RESTORE_MARGIN_MS = 15 * 60_000
const restoreExpiryPattern = /expiry-date="([^"]+)"/

function assertCopy(work: ColdStorageWork, copy: TierCopy): void {
	if (
		!Number.isSafeInteger(copy.size) ||
		copy.size < 1 ||
		copy.size > MAX_COPY_BYTES ||
		managedMemoryKey(work.objectKey)?.owner !== copy.userId ||
		managedMemoryKey(copy.sourceKey)?.owner !== copy.userId ||
		managedMemoryKey(copy.physicalKey)?.owner !== copy.userId ||
		!copy.physicalKey.startsWith(`${copy.userId}/tiers/`) ||
		copy.sourceKey === copy.physicalKey
	)
		throw new Error('Invalid cold storage copy reservation.')
}

/** No imports trigger network access. Construct only after target binding and explicit provider configuration. */
export class S3ColdStorageProvider implements ColdStorageProvider {
	constructor(
		private readonly client: S3Client,
		private readonly target: ColdStorageTarget,
		private readonly now = Date.now
	) {}

	async prepare(work: ColdStorageWork, copy: TierCopy, signal: AbortSignal): Promise<boolean> {
		const source = await this.source(work, copy, signal)
		if (!this.needsRestore(work)) return true
		if (this.restored(source.Restore)) return true
		if (source.Restore?.includes('ongoing-request="true"')) return false
		try {
			await this.client.send(
				new RestoreObjectCommand({
					Bucket: this.target.bucket,
					Key: copy.sourceKey,
					RestoreRequest: { Days: 1, GlacierJobParameters: { Tier: 'Standard' } },
				}),
				{ abortSignal: signal }
			)
		} catch (error) {
			if (!(error instanceof S3ServiceException && error.name === 'RestoreAlreadyInProgress')) throw error
		}
		return false
	}

	async copy(work: ColdStorageWork, copy: TierCopy, signal: AbortSignal): Promise<void> {
		const source = await this.source(work, copy, signal)
		if (this.needsRestore(work) && !this.restored(source.Restore)) throw new Error('Archived source is not ready.')
		const storageClass = work.state === 'archiving' ? this.target.archiveClass : 'STANDARD'
		// The SDK consumes the entire XML response and rejects embedded errors even on HTTP 200.
		const result = await this.client.send(
			new CopyObjectCommand({
				Bucket: this.target.bucket,
				Key: copy.physicalKey,
				CopySource: [this.target.bucket, ...copy.sourceKey.split('/')].map(encodeURIComponent).join('/'),
				CopySourceIfMatch: source.ETag,
				StorageClass: storageClass,
				MetadataDirective: 'COPY',
			}),
			{ abortSignal: signal }
		)
		if (!result.CopyObjectResult?.ETag || result.VersionId) throw new Error('Unverified cold storage copy response.')
		const destination = await this.client.send(
			new HeadObjectCommand({
				Bucket: this.target.bucket,
				Key: copy.physicalKey,
			}),
			{ abortSignal: signal }
		)
		if (
			destination.ContentLength !== copy.size ||
			destination.ETag !== result.CopyObjectResult.ETag ||
			(destination.StorageClass ?? 'STANDARD') !== storageClass ||
			destination.VersionId
		)
			throw new Error('Unverified cold storage copy destination.')
	}

	private needsRestore(work: ColdStorageWork): boolean {
		return work.state === 'restoring' && this.target.provider === 'aws' && this.target.archiveClass !== 'STANDARD_IA'
	}

	private restored(header: string | undefined): boolean {
		if (!header?.includes('ongoing-request="false"')) return false
		const expires = restoreExpiryPattern.exec(header)?.[1]
		return Boolean(expires && Date.parse(expires) > this.now() + RESTORE_MARGIN_MS)
	}

	private async source(work: ColdStorageWork, copy: TierCopy, signal: AbortSignal): Promise<HeadObjectCommandOutput> {
		signal.throwIfAborted()
		assertCopy(work, copy)
		if (this.target.provider === 'aws') {
			// Versioned/suspended buckets can retain private data after ordinary DELETE. Never silently opt into that.
			await assertUnversionedBucket(this.client, this.target.bucket, signal)
		}
		const source = await this.client.send(new HeadObjectCommand({ Bucket: this.target.bucket, Key: copy.sourceKey }), {
			abortSignal: signal,
		})
		const expectedClass = work.state === 'archiving' ? 'STANDARD' : this.target.archiveClass
		if (
			source.ContentLength !== copy.size ||
			!source.ETag ||
			source.VersionId ||
			(source.StorageClass ?? 'STANDARD') !== expectedClass
		) {
			throw new Error('Unverified cold storage copy source.')
		}
		return source
	}
}
