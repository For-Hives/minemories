// The bench report: one table, a row per block and a column per configuration, so a block that renders in one
// configuration and not in another (or doubles) stands out. Rows with a problem anywhere come first.

const RANK = { missing: 0, doubled: 1, unplaced: 2, ok: 3, absent: 4 }
const LABEL = { ok: 'ok', missing: 'missing', doubled: 'doubled', unplaced: 'not placed', absent: '—' }

const escapeHtml = text =>
	String(text).replace(
		/[&<>"']/g,
		char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
	)

/** Rows of the comparison: every block of any configuration, with its result in each one. */
export function compare(results) {
	const ids = new Set()
	for (const result of results) for (const row of result.rows) ids.add(row.id)
	const byConfig = results.map(result => new Map(result.rows.map(row => [row.id, row])))
	const rows = [...ids].map(id => {
		const cells = byConfig.map(map => map.get(id) ?? { id, status: 'absent' })
		const worst = Math.min(...cells.map(cell => RANK[cell.status]))
		const statuses = new Set(cells.filter(cell => cell.status !== 'absent').map(cell => cell.status))
		return { id, cells, worst, differs: statuses.size > 1 }
	})
	rows.sort((a, b) => a.worst - b.worst || Number(b.differs) - Number(a.differs) || a.id.localeCompare(b.id))
	return rows
}

function cellHtml(cell) {
	if (cell.status === 'absent' || cell.status === 'unplaced')
		return `<td class="${cell.status}">${LABEL[cell.status]}</td>`
	const twice = cell.duplicates ? ` · ${cell.duplicates} twice` : ''
	return `<td class="${cell.status}" title="${escapeHtml(JSON.stringify(cell.categories))}">${LABEL[cell.status]}<small>${cell.triangles} tris${twice}</small></td>`
}

/** A self-contained HTML page (no script, no external resource). */
export function reportHtml(results, { generatedAt = new Date().toISOString() } = {}) {
	const rows = compare(results)
	const head = results
		.map(
			result =>
				`<th><strong>${escapeHtml(result.config.id)}</strong><small>${escapeHtml(result.renderer ?? 'renderer unknown')}</small></th>`
		)
		.join('')
	const summary = results
		.map(result => {
			const s = result.summary
			const contraption = result.contraption ? ` · contraption ${result.contraption.status}` : ''
			return `<li><strong>${escapeHtml(result.config.id)}</strong>: ${s.blocks} blocks, ${s.ok} ok, ${s.missing} missing, ${s.doubled} doubled, ${s.unplaced} not placed${contraption}</li>`
		})
		.join('')
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
<p>Generated ${escapeHtml(generatedAt)}. A block is <em>missing</em> when it stayed in the world but nothing was captured in its area, <em>doubled</em> when some of its triangles were drawn twice, <em>not placed</em> when the world did not keep it. Rows outlined in blue differ between configurations.</p>
<ul>${summary}</ul>
<table><thead><tr><th>Block</th>${head}</tr></thead><tbody>
${body}
</tbody></table></body></html>
`
}
