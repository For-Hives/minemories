import { useContext, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { AppContext } from '../app-context'
import { SiteSelect } from '../components/SiteSelect'
import { buttonLime, buttonOutline } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { track } from '../observability/insight'
import './editing.css'

type Capture = Awaited<ReturnType<typeof apiClient.discovery.get>>
type Category = Capture['category']
// The game's text field (kit .mc-field): black, grey 2 px edge, white on focus; the value in the reading font, at the 44 px target.
const fieldClass = 'mc-field w-full! h-11! [font-family:var(--ds-f-text)]!'
const areaClass = 'mc-textarea w-full! [font-family:var(--ds-f-text)]!'
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
			if (!item.voted) track('explore-vote')
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
			track('explore-report')
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
				<SiteSelect
					className={labelClass}
					label={t('Category')}
					value={category}
					options={[
						{ value: '' as const, label: t('All') },
						...categories.map(value => ({ value, label: labels[value] })),
					]}
					onChange={value => {
						setCategory(value)
						setPage(0)
					}}
				/>
				<SiteSelect
					className={labelClass}
					label={t('Sort')}
					value={sort}
					options={[
						{ value: 'recent' as const, label: t('Recent') },
						{ value: 'votes' as const, label: t('Most loved') },
					]}
					onChange={value => {
						setSort(value)
						setPage(0)
					}}
				/>
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
