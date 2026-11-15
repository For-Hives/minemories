import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { apiClient } from '../../api-client'
import { translate } from '../../i18n/catalog'
import { useI18n } from '../../i18n/I18n'
import { ageLabel, versionShares } from '../../lib/admin-insight'
import {
	type DiagnosticDetail,
	type DiagnosticIssue,
	type IssueState,
	issueStates,
	phaseLabels,
	stateLabels,
} from '../diagnostics-data'
import { BarRow, Group } from './AdminKit'
import { ConsoleHeader } from './ConsoleHeader'
import { useConsole } from './console'

const versionOf = (issue: DiagnosticIssue) =>
	issue.lastReport.source === 'mod' ? issue.lastReport.versions.mod : issue.lastReport.versions.api
const phases = ['capture', 'upload', 'pairing', 'crash', 'error'] as const

function IssueSheet({ issue, onClose, onSaved }: { issue: DiagnosticIssue; onClose(): void; onSaved(): void }) {
	const { t, locale } = useI18n()
	const { data } = useConsole()
	const [detail, setDetail] = useState<DiagnosticDetail | null>(null)
	const [error, setError] = useState('')
	const [busy, setBusy] = useState(false)
	useEffect(() => {
		let live = true
		setDetail(null)
		setError('')
		apiClient.diagnostics
			.detail({ fingerprint: issue.fingerprint, page: 0 })
			.then(result => live && setDetail(result))
			.catch(() => live && setError(t('Details unavailable or access revoked.')))
		return () => {
			live = false
		}
	}, [issue.fingerprint, t])
	async function save(state: IssueState) {
		if (!detail) return
		setBusy(true)
		setError('')
		try {
			await apiClient.diagnostics.update({ fingerprint: issue.fingerprint, state, revision: detail.issue.revision })
			onSaved()
		} catch (cause) {
			setError(
				(cause as { code?: string } | null)?.code === 'CONFLICT'
					? t('New data arrived. Refresh before changing the status.')
					: t('Status not saved. Refresh and try again.')
			)
		} finally {
			setBusy(false)
		}
	}
	const latest = detail?.items[0]?.report
	const fleet = data.insights?.versions.mod ?? []
	const shares = detail
		? versionShares(
				detail.items.flatMap(item => (item.report.source === 'mod' ? [item.report.versions.mod] : [])),
				fleet
			).slice(0, 4)
		: []
	const http = latest?.context?.http
	return (
		<motion.aside
			className="mm-con-sheet"
			aria-label={t('Error details')}
			initial={{ opacity: 0, x: 28 }}
			animate={{ opacity: 1, x: 0 }}
			exit={{ opacity: 0, x: 28 }}
			transition={{ type: 'spring', stiffness: 420, damping: 38 }}
		>
			<header>
				<div>
					<span className="mm-con-tag">{translate(locale, phaseLabels[issue.lastReport.phase])}</span>
					<h2>{issue.lastReport.exception.type}</h2>
					<p className="mm-con-hint">
						{issue.lastReport.exception.frames[0]
							? `${issue.lastReport.exception.frames[0].className}.${issue.lastReport.exception.frames[0].methodName}`
							: t('Stack unavailable')}
					</p>
				</div>
				<button type="button" className="mm-con-chip" onClick={onClose}>
					{t('Close')}
				</button>
			</header>
			<div className="mm-con-sheet-body">
				<div className="mm-con-chips">
					<span className="mm-con-tag">
						{issue.count} {t('occurrences')}
					</span>
					<span className="mm-con-tag">
						{issue.devices} {t('devices')}
					</span>
					<span className="mm-con-tag">
						{ageLabel(new Date(issue.lastReceivedAt).toISOString(), Date.now(), locale)}
					</span>
				</div>
				<Group className="mm-con-seg" label={t('Triage status')}>
					{issueStates.map(state => (
						<button
							key={state}
							type="button"
							disabled={busy || !detail}
							aria-pressed={issue.state === state}
							onClick={() => void save(state)}
						>
							{translate(locale, stateLabels[state])}
						</button>
					))}
				</Group>
				{error && <p role="alert">{error}</p>}
				{!(detail || error) && <p role="status">{t('Loading occurrences…')}</p>}
				{shares.length > 0 && fleet.length > 0 && (
					<>
						<h3>{t('Share of this error by version, against the installed fleet')}</h3>
						<ul className="mm-con-rows">
							{shares.map(row => (
								<BarRow
									key={row.version}
									label={row.version}
									share={row.share}
									tone={row.ratio !== null && row.ratio >= 2 ? 'bad' : 'ember'}
									text={row.ratio === null ? `${Math.round(row.share * 100)}%` : `×${row.ratio.toFixed(1)}`}
								/>
							))}
						</ul>
						<p className="mm-con-hint">
							{t('A ratio above 2 means the version has more of this error than its share of the fleet.')}
						</p>
					</>
				)}
				{latest && latest.breadcrumbs.length > 0 && (
					<>
						<h3>{t('Steps before the error')}</h3>
						<ol className="mm-con-rows">
							{latest.breadcrumbs.map((step, index) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: the steps are an ordered log, the same step can repeat
								<li key={`${step.step}-${index}`} className="mm-con-row" style={{ gridTemplateColumns: '1fr auto' }}>
									<span>{step.step}</span>
									<output>{step.elapsedMs} ms</output>
								</li>
							))}
						</ol>
					</>
				)}
				{http && (
					<dl className="mm-con-kv">
						<dt>{t('Request')}</dt>
						<dd>{http.request}</dd>
						{http.status && (
							<>
								<dt>HTTP</dt>
								<dd>
									{http.status}
									{http.error ? ` · ${http.error}` : ''}
								</dd>
							</>
						)}
					</dl>
				)}
				{latest && latest.exception.frames.length > 0 && (
					<>
						<h3>{t('Failure context')}</h3>
						<pre className="mm-con-pre">
							{latest.exception.frames
								.slice(0, 6)
								.map(
									frame =>
										`${frame.className}.${frame.methodName} (${frame.fileName ?? '?'}:${frame.lineNumber ?? '?'})`
								)
								.join('\n')}
						</pre>
					</>
				)}
			</div>
		</motion.aside>
	)
}

/** `/admin/diagnostics`: error groups sorted by impact, with the detail of one in a sheet beside the list. */
export function AdminHealth() {
	const { t, locale } = useI18n()
	const { data, reload } = useConsole()
	const [params, setParams] = useSearchParams()
	const [state, setState] = useState<IssueState | 'all'>('open')
	const [phase, setPhase] = useState<(typeof phases)[number] | null>(null)
	const [items, setItems] = useState<DiagnosticIssue[]>([])
	const [more, setMore] = useState(false)
	const [page, setPage] = useState(0)
	const [revision, setRevision] = useState(0)
	const [failed, setFailed] = useState(false)
	const selectedId = params.get('issue')
	useEffect(() => {
		let live = true
		setFailed(false)
		apiClient.diagnostics
			.list({ state, phase: phase ?? undefined, page })
			.then(result => {
				if (!live) return
				setItems(result.items)
				setMore(result.hasMore)
			})
			.catch(() => live && setFailed(true))
		return () => {
			live = false
		}
	}, [state, phase, page, revision, data.loads])
	const reporting = data.insights?.versions.reportingDevices ?? 0
	const sorted = [...items].sort((a, b) => b.devices - a.devices || b.lastReceivedAt - a.lastReceivedAt)
	const selected = sorted.find(item => item.fingerprint === selectedId) ?? null
	const select = (fingerprint: string | null) =>
		setParams(
			previous => {
				const copy = new URLSearchParams(previous)
				if (fingerprint) copy.set('issue', fingerprint)
				else copy.delete('issue')
				return copy
			},
			{ replace: true }
		)
	return (
		<>
			<ConsoleHeader title={t('Health')} lead={t('What breaks, for whom, and since which version.')} />
			<p className="mm-con-note">
				{t(
					'Private error reports, kept for a short time. Nothing is sent before you connect the game, and you can turn it off in the game. Crash reports may arrive the next time you launch.'
				)}
			</p>
			<div className="mm-con-split">
				<section className="mm-con-card is-list">
					<Group className="mm-con-chips" label={t('Triage status')} style={{ marginBottom: 12 }}>
						{(['open', 'in_progress', 'resolved', 'ignored'] as const).map(value => (
							<button
								key={value}
								type="button"
								className="mm-con-chip"
								aria-pressed={state === value}
								onClick={() => {
									setState(value)
									setPage(0)
								}}
							>
								{translate(locale, stateLabels[value])}
							</button>
						))}
					</Group>
					<Group className="mm-con-chips" label={t('Phase')} style={{ marginBottom: 16 }}>
						<button
							type="button"
							className="mm-con-chip"
							aria-pressed={phase === null}
							onClick={() => {
								setPhase(null)
								setPage(0)
							}}
						>
							{t('filters.allStates')}
						</button>
						{phases.map(value => (
							<button
								key={value}
								type="button"
								className="mm-con-chip"
								aria-pressed={phase === value}
								onClick={() => {
									setPhase(value)
									setPage(0)
								}}
							>
								{translate(locale, phaseLabels[value])}
							</button>
						))}
					</Group>
					{failed && <p role="alert">{t('Diagnostics unavailable or operator access denied.')}</p>}
					<div className="mm-con-table-wrap">
						<table className="mm-con-table">
							<thead>
								<tr>
									<th>{t('Error')}</th>
									<th>{t('Impact')}</th>
									<th>{t('Version')}</th>
									<th>{t('Last seen')}</th>
								</tr>
							</thead>
							<tbody>
								{sorted.map(issue => (
									<tr key={issue.fingerprint} aria-selected={issue.fingerprint === selectedId}>
										<td>
											<button type="button" className="is-open" onClick={() => select(issue.fingerprint)}>
												<strong>{issue.lastReport.exception.type}</strong>
												<small>
													{translate(locale, phaseLabels[issue.lastReport.phase])} · {issue.lastReport.source}
												</small>
											</button>
										</td>
										<td>
											<div className="mm-con-meter" role="presentation">
												<i
													className="is-tone-bad"
													style={{
														width: `${reporting > 0 ? Math.min(100, (issue.devices / reporting) * 100) : Math.min(100, issue.devices * 10)}%`,
													}}
												/>
											</div>
											<small>
												{issue.devices} {t('devices')} · {issue.count} {t('occurrences')}
											</small>
										</td>
										<td>
											<span className="mm-con-tag">{versionOf(issue)}</span>
										</td>
										<td>{ageLabel(new Date(issue.lastReceivedAt).toISOString(), Date.now(), locale)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{!failed && items.length === 0 && <p className="mm-con-note">{t('No error groups match.')}</p>}
					{(page > 0 || more) && (
						<div className="mm-con-chips" style={{ marginTop: 12 }}>
							<button
								type="button"
								className="mm-con-chip"
								disabled={page === 0}
								onClick={() => setPage(value => value - 1)}
							>
								{t('Previous')}
							</button>
							<button
								type="button"
								className="mm-con-chip"
								disabled={!more}
								onClick={() => setPage(value => value + 1)}
							>
								{t('Next')}
							</button>
						</div>
					)}
				</section>
				<div className="is-sheet">
					<AnimatePresence mode="wait">
						{selected && (
							<IssueSheet
								key={selected.fingerprint}
								issue={selected}
								onClose={() => select(null)}
								onSaved={() => {
									setRevision(value => value + 1)
									reload()
								}}
							/>
						)}
					</AnimatePresence>
				</div>
			</div>
		</>
	)
}
