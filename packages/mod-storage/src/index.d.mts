// Types for the public API of index.mjs (consumed by apps/api, which is written in TypeScript).
export type BuiltBy = 'pc' | 'vps'
export interface PublishedLinks {
	modrinth?: string
	curseforge?: string
}
export interface IndexVersion {
	version: string
	builtAt: string
	commit: string
	bytes: number
	sha256: string
	key: string
	builtBy?: BuiltBy
	pinned?: boolean
	published?: PublishedLinks
}
export interface IndexTarget {
	loader: string
	minecraft: string
	loaderVersion: string
	java: string
	fabricApi?: string
	latest: string
	versions: IndexVersion[]
}
export interface ModIndex {
	schema: 1
	generatedAt: string
	targets: Record<string, IndexTarget>
}
export interface S3Like {
	send(command: unknown): Promise<unknown>
}
export interface StorageContext {
	env?: Record<string, string | undefined>
	client?: S3Like
}
export interface UploadTarget {
	id: string
	loader: string
	minecraft: string
	loaderVersion: string
	java: string
	fabricApi?: string
}
export interface StoreUploadOptions extends StorageContext {
	target: UploadTarget
	version: string
	commit: string
	builtAt: string
	builtBy?: BuiltBy
	file: string
	bytes: number
	sha256: string
	replace?: boolean
	keep?: number
	partSize?: number
}
export interface StoreUploadResult {
	latest: boolean
	replaced: boolean
	unchanged: boolean
	index: ModIndex
}

export const BUILT_BY: readonly BuiltBy[]
export const INDEX_KEY: string
export const PART_SIZE: number
export const DEFAULT_MOD_BUCKET: string
export class ModStorageConflictError extends Error {}
export function storageSettings(env?: Record<string, string | undefined>): {
	bucket: string
	endpoint: string
	prefix: string
	region: string
	accessKeyId: string
	secretAccessKey: string
}
export function parseModPrefix(value?: string): string
export function isSafeKey(key: unknown): key is string
export function resolveObjectKey(prefix: string, key: unknown, roots?: string[]): string | null
export function jarName(targetId: string, version: string): string
export function versionPrefix(targetId: string, version: string): string
export function versionKey(targetId: string, version: string): string
export function latestKey(targetId: string): string
export function emptyIndex(): ModIndex
export function validateIndex(value: unknown): ModIndex
export function readIndex(options?: StorageContext): Promise<ModIndex>
export function storeUpload(options: StoreUploadOptions): Promise<StoreUploadResult>
export function pruneStorage(options?: StorageContext & { keep?: number; dryRun?: boolean }): Promise<{
	deleted: { targetId: string; version: string; key: string; bytes: number }[]
	kept: unknown[]
	freedBytes: number
}>
export function storageReport(
	options?: StorageContext
): Promise<{ totalBytes: number; perTarget: Record<string, { versions: number; bytes: number; latest: string }> }>
