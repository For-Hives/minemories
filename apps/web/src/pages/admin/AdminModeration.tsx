import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../../api-client'
import { buttonDark, buttonLime } from '../../components/ui'
import { useI18n } from '../../i18n/I18n'
import { ageLabel, decisionKey, neighbour } from '../../lib/admin-insight'
import { Group } from './AdminKit'
import { ConsoleHeader } from './ConsoleHeader'
import { useConsole } from './console'

const queues = ['pending', 'reported', 'approved', 'rejected'] as const
type Queue = (typeof queues)[number]
type Items = Awaited<ReturnType<typeof apiClient.discovery.queue>>['items']

const editable = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** A approves, R rejects, J and K move through the queue; typing in a field never triggers them. */
function useDecisionKeys(
	decide: (decision: 'approved' | 'rejected') => Promise<void>,
	items: Items,
	selectedId: string | null,
	select: (id: string | undefined) => void
) {
	useEffect(() => {
		function onKey(event: KeyboardEvent) {
			if (editable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
			const action = decisionKey(event.key)
			if (action === 'approved' || action === 'rejected') void decide(action)
			else if (action) select(neighbour(items, selectedId, action === 'next' ? 1 : -1)?.id)
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [decide, items, selectedId, select])
}

function useQueue(queue: Queue, page: number, revision: number, t: ReturnType<typeof useI18n>['t']) {
	const [items, setItems] = useState<Items>([])
	const [more, setMore] = useState(false)
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	useEffect(() => {
		let live = true
		setLoading(true)
		apiClient.discovery
			.queue({ state: queue, page })
			.then(result => {
				if (!live) return
				setItems(result.items)
				setMore(result.hasMore)
				setError('')
				setSelectedId(current =>
					result.items.some(item => item.id === current) ? current : (result.items[0]?.id ?? null)
				)
			})
			.catch(() => live && setError(t('Moderation unavailable or access denied.')))
			.finally(() => live && setLoading(false))
		return () => {
			live = false
		}
	}, [queue, page, revision, t])
	return { items, more, loading, error, setError, selectedId, setSelectedId }
}

type Item = Items[number]
type Translate = ReturnType<typeof useI18n>['t']

function QueuePanel({
	items,
	label,
	loading,
	selectedId,
	onSelect,
	paging,
}: {
	items: Items
	label: string
	loading: boolean
	selectedId: string | null
	onSelect(id: string): void
	paging: { page: number; more: boolean; go(delta: number): void }
}) {
	const { t, locale } = useI18n()
	const now = Date.now()
	return (
		<section className="mm-con-card is-queue" style={{ padding: 0 }} aria-label={label}>
			{items.length === 0 && (
				<p role={loading ? 'status' : undefined} className="mm-con-note" style={{ padding: 16 }}>
					{loading ? t('Loading…') : t('No memories in this queue.')}
				</p>
			)}
			<ul className="mm-con-queue">
				{items.map(item => (
					<li key={item.id}>
						<button type="button" aria-current={item.id === selectedId} onClick={() => onSelect(item.id)}>
							{item.thumbnail ? <img src={item.thumbnail} alt="" /> : <span className="mm-con-thumb" />}
							<span>
								<strong>{item.title}</strong>
								<small>{ageLabel(item.publishedAt, now, locale)}</small>
								{item.owner.submissions === 0 && <span className="mm-con-tag">{t('First submission')}</span>}
								{item.reports.length > 0 && (
									<span className="mm-con-tag is-bad">{t('{count} reported', { count: item.reports.length })}</span>
								)}
							</span>
						</button>
					</li>
				))}
			</ul>
			{(paging.page > 0 || paging.more) && (
				<div className="mm-con-chips" style={{ padding: 12 }}>
					<button
						type="button"
						className="mm-con-chip"
						disabled={paging.page === 0 || loading}
						onClick={() => paging.go(-1)}
					>
						{t('Previous')}
					</button>
					<button type="button" className="mm-con-chip" disabled={!paging.more || loading} onClick={() => paging.go(1)}>
						{t('Next')}
					</button>
				</div>
			)}
		</section>
	)
}

function PreviewPanel({ item }: { item: Item | null }) {
	const { t, locale } = useI18n()
	const now = Date.now()
	if (!item)
		return (
			<section className="mm-con-card is-preview" aria-label={t('Capture')}>
				<p className="mm-con-note">{t('Select a memory in the queue.')}</p>
			</section>
		)
	return (
		<section className="mm-con-card is-preview" aria-label={t('Capture')}>
			<div className="mm-con-sheet-body" style={{ padding: 0 }}>
				<header className="mm-con-bar" style={{ alignItems: 'start' }}>
					<div>
						<h2>{item.title}</h2>
						<p className="mm-con-hint">
							{t('Submitted {time}', { time: ageLabel(item.publishedAt, now, locale) })} · {item.category} · ▲{' '}
							{item.votes}
						</p>
					</div>
					<Link className="mm-con-chip" to={`/public/${item.id}?review=1`}>
						{t('Review GLB')}
					</Link>
				</header>
				{item.thumbnail && <img className="mm-con-shot" src={item.thumbnail} alt={item.title} />}
				<h3>{t('Description')}</h3>
				<p className="mm-con-note">{item.description}</p>
				{item.reason && (
					<>
						<h3>{t('Decision reason (optional)')}</h3>
						<p className="mm-con-note">{item.reason}</p>
					</>
				)}
				<h3>{t('Owner history')}</h3>
				<dl className="mm-con-kv">
					<dt>{t('Earlier submissions')}</dt>
					<dd>{item.owner.submissions}</dd>
					<dt>{t('Approved')}</dt>
					<dd>{item.owner.approved}</dd>
					<dt>{t('Rejected')}</dt>
					<dd>{item.owner.rejected}</dd>
				</dl>
				{item.reports.length > 0 && (
					<>
						<h3>{t('Reports')}</h3>
						<ul className="mm-con-rows">
							{item.reports.map(report => (
								<li key={report.id} className="mm-con-note">
									{report.reason} <span className="mm-con-hint">· {ageLabel(report.createdAt, now, locale)}</span>
								</li>
							))}
						</ul>
					</>
				)}
			</div>
		</section>
	)
}

function presetsOf(t: Translate) {
	return [t('Duplicate'), t('Low effort'), t('Personal information visible'), t('Not Minecraft content')]
}

function DecisionPanel({
	disabled,
	reason,
	onReason,
	onDecide,
}: {
	disabled: boolean
	reason: string
	onReason(value: string): void
	onDecide(decision: 'approved' | 'rejected'): void
}) {
	const { t } = useI18n()
	return (
		<aside className="mm-con-card is-decision mm-con-decision" aria-label={t('Decision')}>
			<h2>{t('Decision')}</h2>
			<button type="button" className={buttonLime} disabled={disabled} onClick={() => onDecide('approved')}>
				{t('Approve')} (A)
			</button>
			<div className="mm-con-chips">
				{presetsOf(t).map(preset => (
					<button key={preset} type="button" className="mm-con-chip" onClick={() => onReason(preset)}>
						{preset}
					</button>
				))}
			</div>
			<label className="mm-con-field">
				{t('Decision reason (optional)')}
				<textarea maxLength={500} value={reason} onChange={event => onReason(event.target.value)} />
			</label>
			<button type="button" className={buttonDark} disabled={disabled} onClick={() => onDecide('rejected')}>
				{t('Reject')} (R)
			</button>
			<p className="mm-con-keys">
				<kbd>A</kbd> {t('Approve')} · <kbd>R</kbd> {t('Reject')} · <kbd>J</kbd> <kbd>K</kbd> {t('move')}
			</p>
		</aside>
	)
}

/** `/admin/moderation`: the queue, the capture and the decision on one screen; A approves, R rejects, J and K move. */
export function AdminModeration() {
	const { t } = useI18n()
	const { data, reload } = useConsole()
	const [queue, setQueue] = useState<Queue>('pending')
	const [page, setPage] = useState(0)
	const [reason, setReason] = useState('')
	const [busy, setBusy] = useState(false)
	const [revision, setRevision] = useState(0)
	const { items, more, loading, error, setError, selectedId, setSelectedId } = useQueue(
		queue,
		page,
		revision + data.loads,
		t
	)
	const selected = items.find(item => item.id === selectedId) ?? null
	const decide = useCallback(
		async (decision: 'approved' | 'rejected') => {
			if (!selected || busy) return
			setBusy(true)
			try {
				await apiClient.discovery.moderate({ id: selected.id, decision, reason: reason.slice(0, 500) })
				setReason('')
				setRevision(value => value + 1)
				reload()
			} catch {
				setError(t('Decision refused. Try again later.'))
			} finally {
				setBusy(false)
			}
		},
		[selected, busy, reason, reload, t, setError]
	)
	useDecisionKeys(decide, items, selectedId, id => id && setSelectedId(id))
	const counts: Partial<Record<Queue, number>> = data.queue
		? { pending: data.queue.pending, reported: data.queue.reported }
		: {}
	const labels: Record<Queue, string> = {
		pending: t('Pending'),
		reported: t('Reported'),
		approved: t('Approved'),
		rejected: t('Rejected'),
	}
	return (
		<>
			<ConsoleHeader title={t('Moderation')} lead={t('Review, decide, next. One screen, keyboard first.')} />
			<Group className="mm-con-seg" label={t('Queue')} style={{ justifySelf: 'start' }}>
				{queues.map(value => (
					<button
						key={value}
						type="button"
						aria-pressed={queue === value}
						onClick={() => {
							setQueue(value)
							setPage(0)
						}}
					>
						{labels[value]}
						{counts[value] !== undefined && ` ${counts[value]}`}
					</button>
				))}
			</Group>
			{error && <p role="alert">{error}</p>}
			<div className="mm-con-tri">
				<QueuePanel
					items={items}
					label={labels[queue]}
					loading={loading}
					selectedId={selectedId}
					onSelect={setSelectedId}
					paging={{ page, more, go: delta => setPage(value => value + delta) }}
				/>
				<PreviewPanel item={selected} />
				<DecisionPanel disabled={!selected || busy} reason={reason} onReason={setReason} onDecide={decide} />
			</div>
		</>
	)
}
