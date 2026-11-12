import { useContext, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { AppContext } from '../app-context'
import { buttonDark, buttonLime, buttonOutline } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { ContentLayout } from './ContentPages'

type Capture = Awaited<ReturnType<typeof apiClient.discovery.get>>
type Category = Capture['category']
// The game's text field (kit .mc-field): black, grey 2 px edge, white on focus; the value in the reading font, at the 44 px target.
const fieldClass = 'mc-field w-full! h-11! [font-family:var(--ds-f-text)]!'
const areaClass = 'mc-textarea w-full! [font-family:var(--ds-f-text)]!'
const selectClass = 'mc-select__control h-11! [font-family:var(--ds-f-text)]!'
// Labels in the game's font.
const labelClass = 'grid gap-2 [font:400_var(--ds-fs-xs)/var(--ds-lh-xs)_var(--f-ui)]'
const categories: Category[] = ['build', 'landscape', 'adventure', 'other']
function useCategoryLabels() {
	const { t } = useI18n()
	return {
		build: t('Build'),
		landscape: t('Landscape'),
		adventure: t('Adventure'),
		other: t('Other'),
	}
}

export function PublicGallery() {
	const { t } = useI18n()
	const session = useContext(AppContext)?.session
	const [moderator, setModerator] = useState(false)
	useEffect(() => {
		let live = true
		setModerator(false)
		if (session)
			apiClient.discovery
				.moderator()
				.then(result => {
					if (live) setModerator(result.allowed)
				})
				.catch(() => {
					if (live) setModerator(false)
				})
		return () => {
			live = false
		}
	}, [session?.user.id])
	const labels = useCategoryLabels()
	const [query, setQuery] = useState('')
	const [category, setCategory] = useState<Category | ''>('')
	const [page, setPage] = useState(0)
	const [sort, setSort] = useState<'recent' | 'votes'>('recent')
	const [result, setResult] = useState<{ items: Capture[]; hasMore: boolean }>({ items: [], hasMore: false })
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [notice, setNotice] = useState('')
	const [busy, setBusy] = useState('')
	const [reportId, setReportId] = useState('')
	const [reportReason, setReportReason] = useState('')
	const [refresh, setRefresh] = useState(0)
	useEffect(() => {
		const controller = new AbortController()
		setLoading(true)
		setError('')
		apiClient.discovery
			.list({ query, category: category || undefined, sort, page }, { signal: controller.signal })
			.then(data => {
				if (!controller.signal.aborted) setResult(data)
			})
			.catch(() => {
				if (!controller.signal.aborted) setError(t('Gallery unavailable. Try again.'))
			})
			.finally(() => {
				if (!controller.signal.aborted) setLoading(false)
			})
		return () => controller.abort()
	}, [query, category, sort, page, refresh, t, session?.user.id])
	async function vote(item: Capture) {
		setBusy(item.id)
		setNotice('')
		try {
			await apiClient.discovery.vote({ id: item.id, voted: !item.voted })
			setRefresh(n => n + 1)
		} catch {
			setNotice(t('Vote refused or limit reached. Try again later.'))
		} finally {
			setBusy('')
		}
	}
	async function report(item: Capture) {
		const reason = reportReason.trim()
		if (!reason) return
		setBusy(item.id)
		try {
			await apiClient.discovery.report({ id: item.id, reason: reason.slice(0, 500) })
			setNotice(t('Report sent to moderators.'))
			setReportId('')
			setReportReason('')
		} catch {
			setNotice(t('Could not report. Try again later.'))
		} finally {
			setBusy('')
		}
	}
	return (
		<section aria-label={t('Public gallery')} className="mm-demo-gallery">
			{moderator && (
				<Link to="/admin/moderation" className={buttonOutline}>
					{t('Moderation')}
				</Link>
			)}
			<div className="mb-6 grid gap-4 sm:grid-cols-3">
				<label className={labelClass}>
					{t('Search')}{' '}
					<input
						className={fieldClass}
						type="search"
						value={query}
						onChange={event => {
							setQuery(event.target.value)
							setPage(0)
						}}
						maxLength={80}
					/>
				</label>
				<label className={labelClass}>
					{t('Category')}{' '}
					<span className="mc-select w-full!">
						<select
							className={selectClass}
							value={category}
							onChange={event => {
								setCategory(event.target.value as Category | '')
								setPage(0)
							}}
						>
							<option value="">{t('All')}</option>
							{categories.map(value => (
								<option key={value} value={value}>
									{labels[value]}
								</option>
							))}
						</select>
					</span>
				</label>
				<label className={labelClass}>
					{t('Sort')}{' '}
					<span className="mc-select w-full!">
						<select
							className={selectClass}
							value={sort}
							onChange={event => {
								setSort(event.target.value as 'recent' | 'votes')
								setPage(0)
							}}
						>
							<option value="recent">{t('Recent')}</option>
							<option value="votes">{t('Most loved')}</option>
						</select>
					</span>
				</label>
			</div>
			{loading && <p role="status">{t('Loading gallery…')}</p>}
			{error && (
				<div role="alert">
					{error}{' '}
					<button type="button" className={buttonOutline} onClick={() => setRefresh(n => n + 1)}>
						{t('Retry')}
					</button>
				</div>
			)}
			{notice && <p role="status">{notice}</p>}
			{!(loading || error) && result.items.length === 0 && <p>{t('No public memories match these filters.')}</p>}
			{!(loading || error) && (
				<div className="mm-angle-grid">
					{result.items.map(item => (
						<article key={item.id} className="mm-angle-card">
							{item.thumbnail && (
								<div
									aria-hidden="true"
									className="mc-pixel h-48 w-full bg-cover bg-center shadow-[0_0_0_2px_var(--outline)]"
									style={{ backgroundImage: `url("${item.thumbnail}")` }}
								/>
							)}
							<span className="mm-kicker">{labels[item.category]}</span>
							<h2>{item.title}</h2>
							<p>{item.description}</p>
							<div className="mm-actions">
								<Link to={`/public/${item.id}`} className={buttonLime}>
									{t('Visit')}
								</Link>
								{session ? (
									<>
										<button
											type="button"
											aria-pressed={item.voted}
											disabled={!!busy}
											onClick={() => void vote(item)}
											className={buttonOutline}
										>
											♥ {item.votes}
										</button>
										<button
											type="button"
											className={buttonOutline}
											disabled={!!busy}
											onClick={() => {
												setReportId(item.id)
												setReportReason('')
											}}
										>
											{t('Report')}
										</button>
									</>
								) : (
									<Link to="/login">
										♥ {item.votes} · {t('Sign in to vote')}
									</Link>
								)}
							</div>
							<Link to={`/public/${item.id}`}>{t('Public memory link ↗')}</Link>
							{reportId === item.id && (
								<form
									onSubmit={event => {
										event.preventDefault()
										void report(item)
									}}
									className="mt-4 grid gap-3"
								>
									<label className={labelClass}>
										{t('Report reason')}
										<textarea
											className={areaClass}
											maxLength={500}
											value={reportReason}
											onChange={event => setReportReason(event.target.value)}
											required
										/>
									</label>
									<button className={buttonOutline} disabled={!!busy || !reportReason.trim()} type="submit">
										{t('Send report')}
									</button>
									<button type="button" className={buttonOutline} onClick={() => setReportId('')}>
										{t('Cancel')}
									</button>
								</form>
							)}
						</article>
					))}
				</div>
			)}
			<div className="mm-actions">
				<button
					type="button"
					className={buttonOutline}
					disabled={page === 0 || loading}
					onClick={() => setPage(n => n - 1)}
				>
					{t('Previous')}
				</button>
				<span className="[font-family:var(--f-ui)]">
					{t('Page')} {page + 1}
				</span>
				<button
					type="button"
					className={buttonOutline}
					disabled={!result.hasMore || loading || !!error}
					onClick={() => setPage(n => n + 1)}
				>
					{t('Next')}
				</button>
			</div>
		</section>
	)
}

export function ModerationPage() {
	const { t } = useI18n()
	const [allowed, setAllowed] = useState(false)
	const [reasons, setReasons] = useState<Record<string, string>>({})
	const [state, setState] = useState<'pending' | 'approved' | 'rejected' | 'reported'>('pending')
	const [page, setPage] = useState(0)
	const [items, setItems] = useState<Awaited<ReturnType<typeof apiClient.discovery.queue>>['items']>([])
	const [more, setMore] = useState(false)
	const [error, setError] = useState('')
	const [loading, setLoading] = useState(true)
	const [busy, setBusy] = useState(false)
	const [refresh, setRefresh] = useState(0)
	const queueLabels = {
		pending: t('Pending'),
		reported: t('Reported'),
		approved: t('Approved'),
		rejected: t('Rejected'),
	}
	useEffect(() => {
		let live = true
		setLoading(true)
		setError('')
		apiClient.discovery
			.moderator()
			.then(async role => {
				if (!role.allowed) throw new Error('Forbidden')
				const queue = await apiClient.discovery.queue({ state, page })
				if (live) {
					setAllowed(true)
					setItems(queue.items)
					setMore(queue.hasMore)
				}
			})
			.catch(() => {
				if (live) {
					setAllowed(false)
					setError(t('Moderation unavailable or access denied.'))
				}
			})
			.finally(() => {
				if (live) setLoading(false)
			})
		return () => {
			live = false
		}
	}, [state, page, refresh, t])
	async function moderate(id: string, decision: 'approved' | 'rejected') {
		const reason = reasons[id] ?? ''
		setBusy(true)
		try {
			await apiClient.discovery.moderate({ id, decision, reason: reason.slice(0, 500) })
			setRefresh(n => n + 1)
		} catch {
			setError(t('Decision refused. Another person must review their own publication.'))
		} finally {
			setBusy(false)
		}
	}
	return (
		<ContentLayout eyebrow="MINEMORIES" title={t('Moderation')} lead={t('Review submitted memories and reports.')}>
			{loading && <p role="status">{t('Loading…')}</p>}
			{error && <p role="alert">{error}</p>}
			{allowed && !loading && (
				<>
					<label className={labelClass}>
						{t('Queue')}
						<span className="mc-select w-full!">
							<select
								className={selectClass}
								value={state}
								onChange={event => {
									setState(event.target.value as typeof state)
									setPage(0)
								}}
							>
								{(['pending', 'reported', 'approved', 'rejected'] as const).map(value => (
									<option key={value} value={value}>
										{queueLabels[value]}
									</option>
								))}
							</select>
						</span>
					</label>
					<div className="mm-angle-grid">
						{items.map(item => (
							<article className="mm-angle-card" key={item.id}>
								<h2>{item.title}</h2>
								<p>{item.description}</p>
								{item.reason && <p>{item.reason}</p>}
								{item.reports.map(report => (
									<p key={report.id}>{report.reason}</p>
								))}
								<label className={`my-3 ${labelClass}`}>
									{t('Decision reason (optional)')}
									<input
										className={fieldClass}
										maxLength={500}
										value={reasons[item.id] ?? ''}
										onChange={event => setReasons(previous => ({ ...previous, [item.id]: event.target.value }))}
									/>
								</label>
								<Link className="mc-link" to={`/public/${item.id}?review=1`}>
									{t('Review GLB')}
								</Link>
								<div className="mm-actions">
									<button
										type="button"
										className={buttonLime}
										disabled={busy}
										onClick={() => void moderate(item.id, 'approved')}
									>
										{t('Approve')}
									</button>
									<button
										type="button"
										className={buttonDark}
										disabled={busy}
										onClick={() => void moderate(item.id, 'rejected')}
									>
										{t('Reject')}
									</button>
								</div>
							</article>
						))}
					</div>
					{!loading && items.length === 0 && <p>{t('No memories in this queue.')}</p>}
					<div className="mm-actions">
						<button
							type="button"
							className={buttonOutline}
							disabled={page === 0 || loading}
							onClick={() => setPage(n => n - 1)}
						>
							{t('Previous')}
						</button>
						<button
							type="button"
							className={buttonOutline}
							disabled={!more || loading}
							onClick={() => setPage(n => n + 1)}
						>
							{t('Next')}
						</button>
					</div>
				</>
			)}
		</ContentLayout>
	)
}
