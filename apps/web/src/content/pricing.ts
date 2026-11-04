export const snapshotCents = 200
export const cloudScheduleCents = [600, 500, 400, 300] as const
export interface QuoteInput {
	snapshots: number
	years: number
	cloud: boolean
}
export const defaultQuote: QuoteInput = { snapshots: 1, years: 4, cloud: true }
export const quoteStorageKey = 'minemories-quote-v1'
export function parseSavedQuote(raw: string | null): QuoteInput {
	try {
		const input: unknown = JSON.parse(raw ?? '{}')
		if (!input || typeof input !== 'object') return defaultQuote
		const data = input as Record<string, unknown>
		if (typeof data.snapshots !== 'number' || typeof data.years !== 'number' || typeof data.cloud !== 'boolean')
			return defaultQuote
		const quote = { snapshots: data.snapshots, years: data.years, cloud: data.cloud }
		quotePrice(quote)
		return quote
	} catch {
		return defaultQuote
	}
}
export function cloudPriceForYear(year: number) {
	if (!Number.isSafeInteger(year) || year < 1) throw new RangeError('Year must be a positive integer.')
	return cloudScheduleCents[Math.min(year - 1, cloudScheduleCents.length - 1)] ?? 300
}
export function quotePrice({ snapshots, years, cloud }: QuoteInput) {
	if (!Number.isSafeInteger(snapshots) || snapshots < 1 || snapshots > 100)
		throw new RangeError('Choose 1–100 snapshots.')
	if (!Number.isSafeInteger(years) || years < 1 || years > 10) throw new RangeError('Choose 1–10 years.')
	const annualCents = cloud ? Array.from({ length: years }, (_, n) => cloudPriceForYear(n + 1) * snapshots) : []
	const captureCents = snapshotCents * snapshots
	const storageCents = annualCents.reduce((sum, price) => sum + price, 0)
	return {
		captureCents,
		storageCents,
		totalCents: captureCents + storageCents,
		annualCents,
		annualPayments: annualCents.map((cents, index) => ({ year: index + 1, cents })),
	}
}
