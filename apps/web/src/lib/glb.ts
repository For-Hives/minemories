const GLB_EXTENSION = /\.glb$/i

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
