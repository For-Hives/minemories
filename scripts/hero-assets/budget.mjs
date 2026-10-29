// Byte budget: the measured baselines live in a versioned file; a metric fails when it exceeds baseline + margin.
const metricsOf = manifest => {
	const files = Object.values(manifest.files)
	const sum = (list, key) => list.reduce((total, entry) => total + entry.bytes[key], 0)
	const stages = files.filter(entry => entry.role === 'stage')
	const base = stages.filter(entry => entry.kind === 'base')
	const deltas = stages.filter(entry => entry.kind === 'delta')
	return {
		baseBrotli: sum(base, 'brotli'),
		deltasBrotli: sum(deltas, 'brotli'),
		stagesBrotli: sum(stages, 'brotli'),
		stagesGzip: sum(stages, 'gzip'),
		charactersBrotli: sum(
			files.filter(entry => entry.role === 'characters'),
			'brotli'
		),
	}
}

export { metricsOf as budgetMetrics }

/**
 * @param {object} manifest
 * @param {{ marginPercent: number, baseline: Record<string, number> }} budget
 * @returns {{ rows: { metric: string, actual: number, baseline: number, limit: number, ok: boolean }[], ok: boolean }}
 */
export function checkBudget(manifest, budget) {
	const actual = metricsOf(manifest)
	const rows = Object.entries(budget.baseline).map(([metric, baseline]) => {
		const limit = Math.floor((baseline * (100 + budget.marginPercent)) / 100)
		return {
			metric,
			actual: actual[metric] ?? Number.POSITIVE_INFINITY,
			baseline,
			limit,
			ok: (actual[metric] ?? Number.POSITIVE_INFINITY) <= limit,
		}
	})
	const unbudgeted = Object.keys(actual).filter(metric => !(metric in budget.baseline))
	return { rows, unbudgeted, ok: rows.every(row => row.ok) && unbudgeted.length === 0 }
}
