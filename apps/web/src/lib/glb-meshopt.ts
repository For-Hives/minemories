import { expandGlb } from '@minemories/api-contract/glb-meshopt'

/** Name of the response header with which the API announces the compressed transport variant. */
export const VARIANT_HEADER = 'X-Minemories-Variant'

/** Adds the Meshopt variant request to a capture URL, keeping any existing query. */
export function withMeshoptVariant(url: string): string {
	return `${url}${url.includes('?') ? '&' : '?'}variant=meshopt`
}

/**
 * Expands a Meshopt transport variant into an ordinary GLB. The decoder (a small WebAssembly module) is
 * loaded on first use; the result goes through the unchanged GLB validator like any other file.
 * Returns null when the bytes are not a well-formed variant.
 */
export async function expandMeshoptGlb(bytes: Uint8Array): Promise<Uint8Array | null> {
	const { MeshoptDecoder } = await import('meshoptimizer/decoder')
	await MeshoptDecoder.ready
	return expandGlb(bytes, MeshoptDecoder)
}
