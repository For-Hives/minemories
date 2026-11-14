// The bench report: one table, a row per block and a column per configuration, so a block that renders in one
// configuration and not in another (or doubles) stands out. Rows with a problem anywhere come first.

const RANK = { missing: 0, doubled: 1, unplaced: 2, ok: 3, absent: 4 }
const LABEL = { ok: 'ok', missing: 'missing', doubled: 'doubled', unplaced: 'not placed', absent: '—' }

const escapeHtml = text =>
	String(text).replace(
		/[&<>"']/g,
		char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
	)

/**
 * Two configurations draw the same block with at least this ratio of triangles between them: worth a look. A block
 * drawn twice through two paths (different textures, so "layered", not "doubled") has exactly twice the triangles.
 */
export const COUNT_RATIO = 1.5

/**
 * Whether the drawn blocks' triangle counts differ by COUNT_RATIO or more between configurations, or layered faces
 * appear in one and not another (the sign of a second drawing path).
 */
function countsDiffer(cells) {
	const drawn = cells.filter(cell => cell.triangles > 0)
	const counts = drawn.map(cell => cell.triangles)
	if (counts.length > 1 && Math.max(...counts) >= COUNT_RATIO * Math.min(...counts)) return true
	return new Set(drawn.map(cell => (cell.overlaps ?? 0) > 0)).size > 1
}

/**
 * Rows of the comparison: every block of any configuration that ran, with its result in each one. A row `differs`
 * when its statuses differ, or when its triangle counts do by more than COUNT_RATIO.
 */
export function compare(results) {
	const ran = results.filter(result => result.rows)
	const ids = new Set()
	for (const result of ran) for (const row of result.rows) ids.add(row.id)
	const byConfig = ran.map(result => new Map(result.rows.map(row => [row.id, row])))
	const rows = [...ids].map(id => {
		const cells = byConfig.map(map => map.get(id) ?? { id, status: 'absent' })
		const worst = Math.min(...cells.map(cell => RANK[cell.status]))
		const statuses = new Set(cells.filter(cell => cell.status !== 'absent').map(cell => cell.status))
		return { id, cells, worst, differs: statuses.size > 1 || countsDiffer(cells) }
	})
	rows.sort((a, b) => a.worst - b.worst || Number(b.differs) - Number(a.differs) || a.id.localeCompare(b.id))
	return rows
}

function cellHtml(cell) {
	if (cell.status === 'absent' || cell.status === 'unplaced')
		return `<td class="${cell.status}">${LABEL[cell.status]}</td>`
	const twice = cell.duplicates ? ` · ${cell.duplicates} twice` : ''
	const layered = cell.overlaps ? ` · ${cell.overlaps} layered` : ''
	return `<td class="${cell.status}" title="${escapeHtml(JSON.stringify(cell.categories))}">${LABEL[cell.status]}<small>${cell.triangles} tris${twice}${layered}</small></td>`
}

function summaryHtml(result) {
	const name = `<strong>${escapeHtml(result.config.id)}</strong>`
	if (!result.rows) return `<li class="missing">${name}: failed, ${escapeHtml(result.error ?? 'no result')}</li>`
	const s = result.summary
	const version = result.mods?.minemories ? ` · Minemories ${escapeHtml(result.mods.minemories)}` : ''
	const c = result.contraption
	const contraption = c ? ` · contraption ${c.status} (${c.triangles}/${c.expected} triangles)` : ''
	return `<li>${name}: ${s.blocks} blocks, ${s.ok} ok, ${s.missing} missing, ${s.doubled} doubled, ${s.unplaced} not placed${contraption}${version}</li>`
}

/** A self-contained HTML page (no script, no external resource). */
export function reportHtml(results, { generatedAt = new Date().toISOString() } = {}) {
	const rows = compare(results)
	const ran = results.filter(result => result.rows)
	const head = ran
		.map(
			result =>
				`<th><strong>${escapeHtml(result.config.id)}</strong><small>${escapeHtml(result.renderer ?? 'renderer unknown')}</small></th>`
		)
		.join('')
	const summary = results.map(summaryHtml).join('')
	const body = rows
		.map(
			row =>
				`<tr${row.differs ? ' class="differs"' : ''}><th>${escapeHtml(row.id)}</th>${row.cells.map(cellHtml).join('')}</tr>`
		)
		.join('\n')
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Minemories render bench</title>
<style>
body{font:14px/1.4 system-ui,sans-serif;margin:16px;background:#111;color:#eee}
table{border-collapse:collapse}th,td{border:1px solid #333;padding:4px 8px;text-align:left;vertical-align:top}
thead th{position:sticky;top:0;background:#222}small{display:block;color:#999;font-size:11px}
.missing{background:#5a1f1f}.doubled{background:#5a4a1f}.unplaced{color:#888}.absent{color:#555}
tr.differs th{outline:2px solid #4a7fd0}
</style></head><body>
<h1>Minemories render bench</h1>
<p>Generated ${escapeHtml(generatedAt)}. A block is <em>missing</em> when it stayed in the world but nothing was captured in its area, <em>doubled</em> when some of its triangles were drawn twice with the same texture, <em>not placed</em> when the world did not keep it. <em>Layered</em> triangles repeat a face with another texture (an overlay, or two drawing paths): shown, not judged. Rows outlined in blue differ between configurations, by status, by ${COUNT_RATIO}x or more in triangles, or by layered faces present in one and not another.</p>
<ul>${summary}</ul>
<table><thead><tr><th>Block</th>${head}</tr></thead><tbody>
${body}
</tbody></table></body></html>
`
}
