import type { S3Like } from './index.mjs'

export interface FakeClient extends S3Like {
	objects: Map<string, { body: Buffer; contentType?: string; metadata: Record<string, string> }>
	calls: { type: string; input: unknown }[]
	sha256(key: string): string
}
export function createFakeClient(options?: { failOn?: (type: string, input: unknown) => boolean }): FakeClient
