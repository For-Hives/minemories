import { isSelfContainedGlb } from '@minemories/api-contract/glb'

const GLB_EXTENSION = /\.glb$/i

export class UnsupportedGlbError extends Error {}

export async function parseEmbeddedGlb<T>(buffer: ArrayBuffer, parse: (buffer: ArrayBuffer) => Promise<T>): Promise<T> {
	if (!isSelfContainedGlb(new Uint8Array(buffer))) {
		throw new UnsupportedGlbError(
			'GLB invalide ou ressources externes : réexporte le fichier avec ses textures et sa géométrie intégrées.'
		)
	}
	return await parse(buffer)
}

export function isGlbFileName(fileName: string): boolean {
	return GLB_EXTENSION.test(fileName)
}

export function formatFileSize(byteLength: number): string {
	if (!Number.isFinite(byteLength) || byteLength < 0) {
		throw new RangeError('File size must be a finite, non-negative number')
	}

	if (byteLength < 1024) return `${byteLength} B`

	const units = ['KiB', 'MiB', 'GiB', 'TiB']
	let value = byteLength
	let unitIndex = -1
	do {
		value /= 1024
		unitIndex += 1
	} while (value >= 1024 && unitIndex < units.length - 1)

	return `${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value)} ${units[unitIndex]}`
}
