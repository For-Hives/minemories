import { expect, test } from 'vitest'
import { gigabytesInput, parseGigabytes } from './storage-limits'

test('role limits are typed in decimal gigabytes, with a point or a comma', () => {
	expect(parseGigabytes('5')).toBe(5_000_000_000)
	expect(parseGigabytes(' 0.5 ')).toBe(500_000_000)
	expect(parseGigabytes('2,5')).toBe(2_500_000_000)
	expect(parseGigabytes('.1')).toBe(100_000_000)
	expect(parseGigabytes('0.000000001')).toBe(1)
	expect(parseGigabytes('1000')).toBe(1_000_000_000_000)
	for (const invalid of ['', '0', '0.0000000001', '1000.000000001', '-1', '1e3', 'abc', '1.2.3', 'Infinity', '5 GB'])
		expect(parseGigabytes(invalid), invalid).toBeNull()
})
test('a byte count becomes an exact editable value', () => {
	expect(gigabytesInput(2_147_483_648)).toBe('2.147483648')
	expect(gigabytesInput(5_000_000_000)).toBe('5')
	expect(gigabytesInput(500_000_000)).toBe('0.5')
	expect(parseGigabytes(gigabytesInput(2_147_483_648))).toBe(2_147_483_648)
})
