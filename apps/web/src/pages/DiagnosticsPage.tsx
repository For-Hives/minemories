import { useEffect, useRef, useState } from 'react'
import { apiClient } from '../api-client'
import { LoadingSkeleton } from '../components/Loading'
import { buttonOutline } from '../components/ui'
import { translate } from '../i18n/catalog'
import { useI18n } from '../i18n/I18n'
import { ContentLayout } from './ContentPages'
import { DiagnosticDetails } from './DiagnosticDetails'
import { type DiagnosticIssue, type IssueFilters, issueStates, phaseLabels, stateLabels } from './diagnostics-data'
import './diagnostics.css'

function IssueCard({ issue, onOpen }: { issue: DiagnosticIssue; onOpen: () => void }) {
	const { t, locale } = useI18n()
	const report = issue.lastReport
	const version = report.source === 'mod' ? report.versions.mod : report.versions.api
	return (
		<article className="mm-diagnostic-card" aria-label={report.exception.type}>
			<div className="mm-diagnostic-toolbar">
				<span>
					{translate(locale, phaseLabels[report.phase])} · {report.source}
				</span>
				<span className={`mm-diagnostic-state mm-diagnostic-${issue.state}`}>
					{translate(locale, stateLabels[issue.state])}
				</span>
			</div>
			<h2>{report.exception.type}</h2>
			<p>
				{report.exception.frames[0]
					? `${report.exception.frames[0].className}.${report.exception.frames[0].methodName}`
					: t('Stack unavailable')}
			</p>
			<p>
				{t('Version')} {version} · {issue.count} {t('occurrences')} · {issue.devices} {t('devices')}
			</p>
			<time dateTime={new Date(issue.lastReceivedAt).toISOString()}>
				{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(issue.lastReceivedAt)}
			</time>
			<button type="button" className={buttonOutline} onClick={onOpen}>
				{t('Inspect error')} <span className="sr-only">{issue.fingerprint}</span>
			</button>
		</article>
	)
}
export function DiagnosticsPage() {
	const { t, locale } = useI18n()
	const [filters, setFilters] = useState<IssueFilters>({ state: 'open', page: 0 })
	const [version, setVersion] = useState('')
	const [items, setItems] = useState<DiagnosticIssue[]>([])
	const [selected, setSelected] = useState<DiagnosticIssue | null>(null)
	const [allowed, setAllowed] = useState(false)
	const [pending, setPending] = useState(true)
	const [more, setMore] = useState(false)
	const [error, setError] = useState('')
	const [refresh, setRefresh] = useState(0)
	const trigger = useRef<HTMLElement | null>(null)
	useEffect(() => {
		let current = true
		setPending(true)
		setError('')
		setItems([])
		setMore(false)
		void apiClient.diagnostics
			.access()
			.then(async role => {
				if (!role.allowed) throw new Error('Forbidden')
				const result = await apiClient.diagnostics.list(filters)
				if (current) {
					setAllowed(true)
					setItems(result.items)
					setMore(result.hasMore)
				}
			})
			.catch(() => {
				if (current) {
					setAllowed(false)
					setSelected(null)
					setError(t('Diagnostics unavailable or operator access denied.'))
				}
			})
			.finally(() => {
				if (current) setPending(false)
			})
		return () => {
			current = false
		}
	}, [filters, refresh, t])
	function close() {
		setSelected(null)
		trigger.current?.focus()
	}
	return (
		<ContentLayout
			eyebrow={t('OPERATOR AREA · PRIVATE')}
			title={t('Mod diagnostics')}
			lead={t('Investigate failed exports, interrupted uploads and crashes reported with consent.')}
		>
			<p className="mm-note">
				{t(
					'Private technical reports with limited retention. No reports without pairing and player consent. Crash reports may arrive after the next game launch.'
				)}
			</p>
			{error && <p role="alert">{error}</p>}
			<button
				type="button"
				className={buttonOutline}
				disabled={pending}
				onClick={() => {
					close()
					setRefresh(value => value + 1)
				}}
			>
				{t('Refresh')}
			</button>
			{pending && <LoadingSkeleton label={t('Loading diagnostics…')} />}
			{allowed && (
				<>
					<form
						className="mm-diagnostic-filters"
						onSubmit={event => {
							event.preventDefault()
							close()
							setFilters(value => ({ ...value, version: version.trim() || undefined, page: 0 }))
						}}
					>
						<label>
							{t('Status')}
							<select
								aria-label={t('Status')}
								value={filters.state}
								onChange={event => {
									close()
									setFilters(value => ({ ...value, state: event.target.value as IssueFilters['state'], page: 0 }))
								}}
							>
								<option value="all">{t('filters.allStates')}</option>
								{issueStates.map(value => (
									<option value={value} key={value}>
										{translate(locale, stateLabels[value])}
									</option>
								))}
							</select>
						</label>
						<label>
							{t('Phase')}
							<select
								aria-label={t('Phase')}
								value={filters.phase ?? ''}
								onChange={event => {
									close()
									setFilters(value => ({
										...value,
										phase: (event.target.value || undefined) as IssueFilters['phase'],
										page: 0,
									}))
								}}
							>
								<option value="">{t('All')}</option>
								{Object.entries(phaseLabels).map(([value, label]) => (
									<option key={value} value={value}>
										{translate(locale, label)}
									</option>
								))}
							</select>
						</label>
						<label>
							{t('Source')}
							<select
								aria-label={t('Source')}
								value={filters.source ?? ''}
								onChange={event => {
									close()
									setFilters(value => ({
										...value,
										source: (event.target.value || undefined) as IssueFilters['source'],
										page: 0,
									}))
								}}
							>
								<option value="">{t('All')}</option>
								<option value="mod">Mod</option>
								<option value="api">API</option>
							</select>
						</label>
						<label>
							{t('Mod / API version')}
							<input
								value={version}
								onChange={event => setVersion(event.target.value)}
								maxLength={64}
								pattern="[A-Za-z0-9][A-Za-z0-9._+\-]*"
								placeholder="0.2.1-beta.1"
							/>
						</label>
						<button className={buttonOutline} type="submit">
							{t('Filter')}
						</button>
					</form>
					<p role="status">
						{items.length} {t('groups on this page')}
					</p>
					{!(pending || items.length) && <p>{t('No errors match these filters.')}</p>}
					<div className="mm-diagnostic-grid">
						{items.map(issue => (
							<IssueCard
								key={issue.fingerprint}
								issue={issue}
								onOpen={() => {
									trigger.current = document.activeElement as HTMLElement
									setSelected(issue)
								}}
							/>
						))}
					</div>
					<nav className="mm-diagnostic-toolbar" aria-label={t('Diagnostic pages')}>
						<button
							className={buttonOutline}
							type="button"
							disabled={!filters.page}
							onClick={() => {
								close()
								setFilters(value => ({ ...value, page: (value.page ?? 0) - 1 }))
							}}
						>
							{t('Previous page')}
						</button>
						<span>
							{t('Page')} {(filters.page ?? 0) + 1}
						</span>
						<button
							className={buttonOutline}
							type="button"
							disabled={!more}
							onClick={() => {
								close()
								setFilters(value => ({ ...value, page: (value.page ?? 0) + 1 }))
							}}
						>
							{t('Next page')}
						</button>
					</nav>
				</>
			)}
			{allowed && selected && (
				<DiagnosticDetails
					key={selected.fingerprint}
					issue={selected}
					onClose={close}
					onUpdated={() => {
						close()
						setRefresh(value => value + 1)
					}}
				/>
			)}
		</ContentLayout>
	)
}
