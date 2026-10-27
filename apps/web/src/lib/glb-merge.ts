export { GlbMergeError, type GlbTilePart, mergeGlbTiles } from '@minemories/api-contract/glb-merge'

const FILE_NAME_SLUG_MAX = 48
const TRAILING_DASH = /-+$/

export function exportFileName(name: string, at: string): string {
	return `${slug(name)}-${timestamp(at)}.glb`
}

function slug(name: string): string {
	const slugged = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, FILE_NAME_SLUG_MAX)
		.replace(TRAILING_DASH, '')
	return slugged === '' ? 'capture' : slugged
}

function timestamp(at: string): string {
	const date = new Date(at)
	if (Number.isNaN(date.getTime())) return 'undated'
	const pad = (value: number, size = 2) => String(value).padStart(size, '0')
	const day = `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
	return `${day}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
}
