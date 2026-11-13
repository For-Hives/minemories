import { MAX_ROLE_STORAGE_BYTES } from '@minemories/api-contract'

const GIGABYTE = 1_000_000_000
const decimalPattern = /^\d+(?:[.,]\d+)?$|^[.,]\d+$/

/**
 * Bytes for a size typed in decimal gigabytes ("5", "0.5", "2,5"), or `null` when it is not a usable role limit
 * (empty, not a plain number, zero or below one byte, above `MAX_ROLE_STORAGE_BYTES`).
 */
export function parseGigabytes(text: string): number | null {
	const trimmed = text.trim()
	if (!decimalPattern.test(trimmed)) return null
	const bytes = Math.round(Number(trimmed.replace(',', '.')) * GIGABYTE)
	return bytes > 0 && bytes <= MAX_ROLE_STORAGE_BYTES ? bytes : null
}
/** The editable decimal-gigabyte text of a byte count, exact to the byte (2147483648 -> "2.147483648"). */
export function gigabytesInput(bytes: number): string {
	return String(Number((bytes / GIGABYTE).toFixed(9)))
}
