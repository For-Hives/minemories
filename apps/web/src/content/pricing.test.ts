import { expect, test } from 'vitest'
import { cloudPriceForYear, defaultQuote, parseSavedQuote, quotePrice } from './pricing'

test('cloud decreases yearly to three euros and stays at that floor', () => {
	expect([1, 2, 3, 4, 5, 20].map(cloudPriceForYear)).toEqual([600, 500, 400, 300, 300, 300])
	for (const year of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
		expect(() => cloudPriceForYear(year)).toThrow(RangeError)
})
test('quotes keep creation separate from annual renewals and multiply by stored snapshot count', () => {
	const quote = quotePrice({ snapshots: 3, years: 5, cloud: true })
	expect(quote.captureCents).toBe(600)
	expect(quote.annualCents).toEqual([1800, 1500, 1200, 900, 900])
	expect(quote.storageCents).toBe(6300)
	expect(quote.totalCents).toBe(6900)
	expect(quote.annualPayments[4]).toEqual({ year: 5, cents: 900 })
	const local = quotePrice({ snapshots: 3, years: 5, cloud: false })
	expect(local.totalCents).toBe(600)
	expect(local.annualCents).toEqual([])
	expect(quotePrice({ snapshots: 100, years: 10, cloud: true }).totalCents).toBe(380000)
})
test('invalid counts and durations cannot produce a quote or become restored preferences', () => {
	for (const snapshots of [0, -2, 101, 1.5, Number.NaN])
		expect(() => quotePrice({ snapshots, years: 4, cloud: true })).toThrow(RangeError)
	for (const years of [0, -2, 11, 1.5, Number.NaN])
		expect(() => quotePrice({ snapshots: 1, years, cloud: true })).toThrow(RangeError)
	for (const raw of [
		null,
		'{broken',
		'null',
		'[]',
		'{"snapshots":0,"years":4,"cloud":true}',
		'{"snapshots":2,"years":4,"cloud":"yes"}',
	])
		expect(parseSavedQuote(raw)).toEqual(defaultQuote)
	expect(parseSavedQuote('{"snapshots":2,"years":5,"cloud":false,"other":"ignored"}')).toEqual({
		snapshots: 2,
		years: 5,
		cloud: false,
	})
})
