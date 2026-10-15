import { useEffect, useRef, useState } from 'react'
import { apiClient } from '../api-client'
import { LoadingSkeleton } from '../components/Loading'
import { buttonOutline } from '../components/ui'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'
import { ContentLayout } from './ContentPages'
import { DiagnosticDetails } from './DiagnosticDetails'
import { type DiagnosticIssue, type IssueFilters, issueStates, phaseLabels, stateLabels } from './diagnostics-data'
import './diagnostics.css'

function IssueCard({ issue, onOpen }: { issue: DiagnosticIssue; onOpen: () => void }) {
	const { copy, locale } = useLocalizedCopy()
	const report = issue.lastReport
	const version = report.source === 'mod' ? report.versions.mod : report.versions.api
	return (
		<article className="mm-diagnostic-card" aria-label={report.exception.type}>
			<div className="mm-diagnostic-toolbar">
				<span>
					{phaseLabels[report.phase][locale]} · {report.source}
				</span>
				<span className={`mm-diagnostic-state mm-diagnostic-${issue.state}`}>{stateLabels[issue.state][locale]}</span>
			</div>
			<h2>{report.exception.type}</h2>
			<p>
				{report.exception.frames[0]
					? `${report.exception.frames[0].className}.${report.exception.frames[0].methodName}`
					: copy('Trace indisponible', 'Stack unavailable')}
			</p>
			<p>
				{copy('Version', 'Version')} {version} · {issue.count} {copy('occurrences', 'occurrences')} · {issue.devices}{' '}
				{copy('appareils', 'devices')}
			</p>
			<time dateTime={new Date(issue.lastReceivedAt).toISOString()}>
				{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(issue.lastReceivedAt)}
			</time>
			<button type="button" className={buttonOutline} onClick={onOpen}>
				{copy('Examiner l’erreur', 'Inspect error')} <span className="sr-only">{issue.fingerprint}</span>
			</button>
		</article>
	)
}
export function DiagnosticsPage() {
	const { copy, locale } = useLocalizedCopy()
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
					setError(
						copy(
							'Diagnostics indisponibles ou accès opérateur refusé.',
							'Diagnostics unavailable or operator access denied.'
						)
					)
				}
			})
			.finally(() => {
				if (current) setPending(false)
			})
		return () => {
			current = false
		}
	}, [filters, refresh, copy])
	function close() {
		setSelected(null)
		trigger.current?.focus()
	}
	return (
		<ContentLayout
			eyebrow={copy('ESPACE OPÉRATEUR · PRIVÉ', 'OPERATOR AREA · PRIVATE')}
			title={copy('Diagnostics du mod', 'Mod diagnostics')}
			lead={copy(
				'Comprendre les exports échoués, les envois interrompus et les crashs signalés avec accord.',
				'Investigate failed exports, interrupted uploads and crashes reported with consent.'
			)}
		>
			<p className="mm-note">
				{copy(
					'Rapports techniques privés et limités dans le temps. Aucun rapport sans appairage et accord du joueur. Les crashs peuvent arriver après le prochain lancement du jeu.',
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
				{copy('Actualiser', 'Refresh')}
			</button>
			{pending && <LoadingSkeleton label={copy('Chargement des diagnostics…', 'Loading diagnostics…')} />}
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
							{copy('Statut', 'Status')}
							<select
								aria-label={copy('Statut', 'Status')}
								value={filters.state}
								onChange={event => {
									close()
									setFilters(value => ({ ...value, state: event.target.value as IssueFilters['state'], page: 0 }))
								}}
							>
								<option value="all">{copy('Tous', 'All')}</option>
								{issueStates.map(value => (
									<option value={value} key={value}>
										{stateLabels[value][locale]}
									</option>
								))}
							</select>
						</label>
						<label>
							{copy('Étape', 'Phase')}
							<select
								aria-label={copy('Étape', 'Phase')}
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
								<option value="">{copy('Toutes', 'All')}</option>
								{Object.entries(phaseLabels).map(([value, label]) => (
									<option key={value} value={value}>
										{label[locale]}
									</option>
								))}
							</select>
						</label>
						<label>
							{copy('Source', 'Source')}
							<select
								aria-label={copy('Source', 'Source')}
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
								<option value="">{copy('Toutes', 'All')}</option>
								<option value="mod">Mod</option>
								<option value="api">API</option>
							</select>
						</label>
						<label>
							{copy('Version du mod / API', 'Mod / API version')}
							<input
								value={version}
								onChange={event => setVersion(event.target.value)}
								maxLength={64}
								pattern="[A-Za-z0-9][A-Za-z0-9._+\-]*"
								placeholder="0.2.1-beta.1"
							/>
						</label>
						<button className={buttonOutline} type="submit">
							{copy('Filtrer', 'Filter')}
						</button>
					</form>
					<p role="status">
						{items.length} {copy('groupes sur cette page', 'groups on this page')}
					</p>
					{!(pending || items.length) && (
						<p>{copy('Aucune erreur correspondant à ces filtres.', 'No errors match these filters.')}</p>
					)}
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
					<nav className="mm-diagnostic-toolbar" aria-label={copy('Pages des diagnostics', 'Diagnostic pages')}>
						<button
							className={buttonOutline}
							type="button"
							disabled={!filters.page}
							onClick={() => {
								close()
								setFilters(value => ({ ...value, page: (value.page ?? 0) - 1 }))
							}}
						>
							{copy('Page précédente', 'Previous page')}
						</button>
						<span>
							{copy('Page', 'Page')} {(filters.page ?? 0) + 1}
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
							{copy('Page suivante', 'Next page')}
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
