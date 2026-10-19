import { useEffect, useRef, useState } from 'react'
import { apiClient } from '../api-client'
import { buttonDark, buttonOutline } from '../components/ui'
import { translate } from '../i18n/catalog'
import { useI18n } from '../i18n/I18n'
import {
	type DiagnosticDetail,
	type DiagnosticIssue,
	type IssueState,
	issueStates,
	stateLabels,
} from './diagnostics-data'

function date(value: number | string, locale: string) {
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
function Report({ item }: { item: DiagnosticDetail['items'][number] }) {
	const { t, locale } = useI18n()
	const { report } = item
	return (
		<article className="mm-diagnostic-report" aria-label={report.id}>
			<h3>
				{t('Occurrence')} · {date(report.occurredAt, locale)}
			</h3>
			<dl className="mm-diagnostic-metadata">
				<dt>{t('Received')}</dt>
				<dd>{date(item.receivedAt, locale)}</dd>
				<dt>{t('Device')}</dt>
				<dd>
					<code>{item.deviceId}</code>
				</dd>
				<dt>{t('Correlation')}</dt>
				<dd>
					<code>{report.correlationId}</code>
				</dd>
				<dt>{t('Version')}</dt>
				<dd>{JSON.stringify(report.versions)}</dd>
			</dl>
			<h4>{report.exception.type}</h4>
			{report.exception.frames.length ? (
				<pre>
					{report.exception.frames
						.map(
							frame => `${frame.className}.${frame.methodName} (${frame.fileName ?? '?'}:${frame.lineNumber ?? '?'})`
						)
						.join('\n')}
				</pre>
			) : (
				<p>{t('No permitted stack frame available.')}</p>
			)}
			<details>
				<summary>{t('Steps before the error')}</summary>
				{report.breadcrumbs.length ? (
					<pre>{report.breadcrumbs.map(step => `${step.elapsedMs} ms — ${step.step}`).join('\n')}</pre>
				) : (
					<p>{t('No recorded steps.')}</p>
				)}
			</details>
		</article>
	)
}
export function DiagnosticDetails({
	issue,
	onClose,
	onUpdated,
}: {
	issue: DiagnosticIssue
	onClose: () => void
	onUpdated: () => void
}) {
	const { t, locale } = useI18n()
	const [detail, setDetail] = useState<DiagnosticDetail | null>(null)
	const [page, setPage] = useState(0)
	const [refresh, setRefresh] = useState(0)
	const [error, setError] = useState('')
	const [pending, setPending] = useState(true)
	const [busy, setBusy] = useState(false)
	const [state, setState] = useState<IssueState>(issue.state)
	const heading = useRef<HTMLHeadingElement>(null)
	const live = useRef(true)
	useEffect(() => {
		live.current = true
		heading.current?.focus()
		return () => {
			live.current = false
		}
	}, [])
	useEffect(() => {
		let current = true
		setPending(true)
		setError('')
		apiClient.diagnostics
			.detail({ fingerprint: issue.fingerprint, page })
			.then(result => {
				if (current) {
					setDetail(result)
					setState(result.issue.state)
				}
			})
			.catch(() => {
				if (current) {
					setDetail(null)
					setError(t('Details unavailable or access revoked.'))
				}
			})
			.finally(() => {
				if (current) setPending(false)
			})
		return () => {
			current = false
		}
	}, [issue.fingerprint, page, refresh, t])
	async function update() {
		if (!detail) return
		setBusy(true)
		setError('')
		try {
			await apiClient.diagnostics.update({ fingerprint: issue.fingerprint, state, revision: detail.issue.revision })
			if (live.current) onUpdated()
		} catch (error) {
			if (!live.current) return
			const conflict = (error as { code?: string } | null)?.code === 'CONFLICT'
			setError(
				conflict
					? t('New data arrived. Refresh before changing the status.')
					: t('Status not saved. Refresh and try again.')
			)
		} finally {
			if (live.current) setBusy(false)
		}
	}
	return (
		<section className="mm-diagnostic-detail" aria-labelledby="diagnostic-detail-title">
			<div className="mm-diagnostic-toolbar">
				<h2 ref={heading} tabIndex={-1} id="diagnostic-detail-title">
					{t('Error details')}
				</h2>
				<button className={buttonOutline} type="button" onClick={onClose}>
					{t('Close details')}
				</button>
			</div>
			<p>
				<code>{issue.fingerprint}</code>
			</p>
			{pending && <p role="status">{t('Loading occurrences…')}</p>}
			{error && <p role="alert">{error}</p>}
			<button
				type="button"
				className={buttonOutline}
				disabled={pending || busy}
				onClick={() => setRefresh(value => value + 1)}
			>
				{t('Refresh details')}
			</button>
			{detail && !pending && (
				<>
					<div className="mm-diagnostic-toolbar">
						<label>
							{t('Triage status')}
							<select
								aria-label={t('Triage status')}
								value={state}
								disabled={busy}
								onChange={event => setState(event.target.value as IssueState)}
							>
								{issueStates.map(value => (
									<option value={value} key={value}>
										{translate(locale, stateLabels[value])}
									</option>
								))}
							</select>
						</label>
						<button type="button" className={buttonDark} disabled={busy} onClick={() => void update()}>
							{busy ? t('Saving…') : t('Save status')}
						</button>
					</div>
					<p>{t('A new occurrence automatically reopens a resolved issue. Ignored issues remain ignored.')}</p>
					{detail.items.map(item => (
						<Report key={`${item.deviceId}-${item.report.id}`} item={item} />
					))}
					<div className="mm-diagnostic-toolbar">
						<button
							type="button"
							className={buttonOutline}
							disabled={page === 0 || busy}
							onClick={() => setPage(value => value - 1)}
						>
							{t('Previous occurrences')}
						</button>
						<span>
							{t('Page')} {page + 1}
						</span>
						<button
							type="button"
							className={buttonOutline}
							disabled={!detail.hasMore || busy}
							onClick={() => setPage(value => value + 1)}
						>
							{t('Next occurrences')}
						</button>
					</div>
				</>
			)}
		</section>
	)
}
