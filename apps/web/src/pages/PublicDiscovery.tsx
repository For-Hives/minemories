import { type Ref, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { buttonLime, buttonOutline } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { useLivePage } from './gallery-data'
import { DraftMarker } from './RenameField'
import { useDraft } from './use-draft'

type Capture = Awaited<ReturnType<typeof apiClient.discovery.get>>
type Category = Capture['category']
type Publication = Awaited<ReturnType<typeof apiClient.discovery.status>>
type PublicationState = Publication['state']
interface PublicationForm {
	title: string
	description: string
	category: Category
}
const fieldClass = 'mc-field mm-field-fill'
const categories: Category[] = ['build', 'landscape', 'adventure', 'other']
const TITLE_MAX = 80
const DESCRIPTION_MAX = 500
/** States in which a submission is current: the button then sends changes only. */
const submittedStates: PublicationState[] = ['pending', 'approved', 'rejected']

function isPublicationForm(value: unknown): value is PublicationForm {
	if (typeof value !== 'object' || value === null) return false
	const form = value as Record<string, unknown>
	return (
		typeof form.title === 'string' &&
		typeof form.description === 'string' &&
		categories.includes(form.category as Category)
	)
}

/** What the server stores: the publish contract trims both texts. */
function trimmed(form: PublicationForm): PublicationForm {
	return { title: form.title.trim(), description: form.description.trim(), category: form.category }
}

function sameForm(a: PublicationForm, b: PublicationForm): boolean {
	return a.title === b.title && a.description === b.description && a.category === b.category
}

function useCategoryLabels() {
	const { t } = useI18n()
	return {
		build: t('Build'),
		landscape: t('Landscape'),
		adventure: t('Adventure'),
		other: t('Other'),
	}
}

/** Where the capture stands, in one line, and what that means. */
function StateCard({ status, card }: { status: Publication; card: Ref<HTMLDivElement> }) {
	const { t } = useI18n()
	const states: Record<PublicationState, [string, string]> = {
		private: [
			t('Private'),
			t('Only you can see this capture. Nothing is public until a moderator approves a submission.'),
		],
		pending: [
			t('Awaiting moderation'),
			t('A moderator reviews your submission before it appears in the public gallery.'),
		],
		approved: [t('Published'), t('Everyone can see this capture in the public gallery.')],
		rejected: [t('publication.state.rejected'), t('A moderator refused this submission. Change it and submit again.')],
		revoked: [
			t('Withdrawn'),
			t('You withdrew this capture from the public gallery. You can submit it again at any time.'),
		],
	}
	const [label, meaning] = states[status.state]
	return (
		// Focused by script only: focus lands here when a withdrawal ends, since its control goes away.
		<div ref={card} className="mm-publication-state" data-state={status.state} tabIndex={-1}>
			<strong>{label}</strong>
			<span>{meaning}</span>
			{status.reason && (
				<span className="mm-publication-reason">{t('Moderator note: {reason}', { reason: status.reason })}</span>
			)}
			{status.state === 'approved' && status.id && <Link to={`/public/${status.id}`}>{t('View publication')}</Link>}
		</div>
	)
}

function Counter({ id, length, max }: { id: string; length: number; max: number }) {
	return (
		<span id={id} className="mm-publication-counter" data-full={length >= max}>
			{length} / {max}
		</span>
	)
}

/** The four categories as one row of pills: native radios, so arrow keys move between them. */
function CategoryPills({
	name,
	disabled,
	value,
	onChange,
}: {
	name: string
	disabled: boolean
	value: Category
	onChange: (category: Category) => void
}) {
	const { t } = useI18n()
	const labels = useCategoryLabels()
	return (
		<fieldset className="mm-publication-categories" disabled={disabled}>
			<legend>{t('Public category')}</legend>
			<div className="mm-segmented">
				{categories.map(category => (
					<label key={category}>
						<input
							type="radio"
							name={name}
							value={category}
							checked={value === category}
							onChange={() => onChange(category)}
						/>
						<span>{labels[category]}</span>
					</label>
				))}
			</div>
		</fieldset>
	)
}

/** Withdrawal asks once, inline, before it happens. */
function WithdrawControl({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
	const { t } = useI18n()
	const [asking, setAsking] = useState(false)
	const cancel = useRef<HTMLButtonElement>(null)
	const withdraw = useRef<HTMLButtonElement>(null)
	const opened = useRef(false)
	useEffect(() => {
		if (asking) cancel.current?.focus()
		else if (opened.current) withdraw.current?.focus()
		opened.current = asking
	}, [asking])
	if (!asking)
		return (
			<button ref={withdraw} type="button" className={buttonOutline} disabled={busy} onClick={() => setAsking(true)}>
				{t('Withdraw publication')}
			</button>
		)
	return (
		<fieldset className="mm-publication-confirm">
			<legend>{t('Withdraw publication?')}</legend>
			<p>{t('The capture leaves the public gallery but stays in yours.')}</p>
			<div>
				<button
					type="button"
					className={buttonLime}
					disabled={busy}
					onClick={() => {
						opened.current = false
						setAsking(false)
						onConfirm()
					}}
				>
					{t('Yes, withdraw')}
				</button>
				<button ref={cancel} type="button" className={buttonOutline} onClick={() => setAsking(false)}>
					{t('Cancel')}
				</button>
			</div>
		</fieldset>
	)
}

function submitHint(form: PublicationForm, consent: boolean, unchanged: boolean): string {
	if (!form.title.trim()) return 'Add a public title to submit.'
	if (unchanged) return 'Nothing has changed since your last submission.'
	return consent ? '' : 'Tick the consent box to submit.'
}

function submitLabel(submitting: boolean, current: boolean): string {
	if (submitting) return 'Submitting…'
	return current ? 'Submit changes for moderation' : 'Submit for moderation'
}

function usePublicationStatus(memoryId: string) {
	const [status, setStatus] = useState<Publication | null>(null)
	const [failed, setFailed] = useState(false)
	const [attempt, setAttempt] = useState(0)
	useEffect(() => {
		let live = true
		apiClient.discovery
			.status({ memoryId })
			.then(result => {
				if (live) setStatus(result)
			})
			.catch(() => {
				if (live) setFailed(true)
			})
		return () => {
			live = false
		}
	}, [memoryId, attempt])
	const retry = () => {
		setFailed(false)
		setAttempt(value => value + 1)
	}
	return { status, failed, setStatus, retry }
}

export function PublicationPanel({
	memory,
}: {
	memory: { id: string; name: string; metadata: { thumbnail: string | null } }
}) {
	const { t } = useI18n()
	const active = useLivePage()
	const panel = useRef<HTMLElement>(null)
	useEffect(() => {
		// Brought into view once; focus stays where the owner put it.
		panel.current?.scrollIntoView?.({ block: 'nearest' })
	}, [])
	const { status, failed, setStatus, retry } = usePublicationStatus(memory.id)
	const card = useRef<HTMLDivElement>(null)
	// Until the status answers, the fields hold still: the form would otherwise jump to the submission under the cursor.
	const loading = status === null && !failed
	// Older APIs omit the submission: the form then starts from the capture.
	const submission = status?.submission ?? null
	const base = submission ?? { title: memory.name.slice(0, TITLE_MAX), description: '', category: 'build' as Category }
	const form = useDraft('publication', memory.id, base, isPublicationForm, {
		normalize: trimmed,
		ready: status !== null,
	})
	const [consent, setConsent] = useState(false)
	const [busy, setBusy] = useState<'submit' | 'withdraw' | null>(null)
	const [error, setError] = useState('')
	const [notice, setNotice] = useState('')
	const update = (patch: Partial<PublicationForm>) => {
		setNotice('')
		form.setValue({ ...form.value, ...patch })
	}
	const current = status !== null && submittedStates.includes(status.state)
	const unchanged = current && submission !== null && sameForm(trimmed(form.value), submission)
	const hint = submitHint(form.value, consent, unchanged)

	async function submit() {
		const sent = trimmed(form.value)
		setBusy('submit')
		setError('')
		setNotice('')
		try {
			const result = await apiClient.discovery.publish({
				memoryId: memory.id,
				...sent,
				thumbnail: memory.metadata.thumbnail,
				consent: true,
			})
			if (!active.current) return
			setStatus({ ...result, submission: result.submission ?? sent })
			form.clear()
			setConsent(false)
			setNotice('Submitted — awaiting moderation')
		} catch {
			if (active.current) setError('Publication refused or limit reached. Try again later.')
		} finally {
			if (active.current) setBusy(null)
		}
	}

	async function revoke() {
		setBusy('withdraw')
		setError('')
		setNotice('')
		try {
			const result = await apiClient.discovery.revoke({ memoryId: memory.id })
			if (!active.current) return
			setStatus(previous => ({ ...result, submission: result.submission ?? previous?.submission ?? null }))
		} catch {
			if (active.current) setError('Could not withdraw the publication. Try again later.')
		} finally {
			if (active.current) {
				setBusy(null)
				// The withdraw control is gone or was disabled: the keyboard stays in the panel, on the current state.
				card.current?.focus()
			}
		}
	}

	const fieldId = `publication-${memory.id}`
	return (
		<section ref={panel} aria-label={t('Public publication')} className="mm-publication">
			<h4>{t('Publish in the public gallery')}</h4>
			{status && <StateCard status={status} card={card} />}
			{loading && <p className="mm-publication-loading">{t('Checking…')}</p>}
			{failed && (
				<div className="mm-publication-failed">
					<p role="alert">{t('Publication status unavailable.')}</p>
					<button type="button" className={buttonOutline} onClick={retry}>
						{t('Retry')}
					</button>
				</div>
			)}
			{form.isDraft && <DraftMarker onDiscard={form.discard} />}
			<form
				className="mm-publication-form"
				onSubmit={event => {
					event.preventDefault()
					if (!hint && status && busy === null) void submit()
				}}
			>
				<div className="mm-publication-field">
					<span className="mm-publication-label">
						<label htmlFor={`${fieldId}-title`}>{t('Public title')}</label>
						<Counter id={`${fieldId}-title-count`} length={form.value.title.length} max={TITLE_MAX} />
					</span>
					<input
						id={`${fieldId}-title`}
						value={form.value.title}
						maxLength={TITLE_MAX}
						readOnly={loading}
						aria-describedby={`${fieldId}-title-count`}
						onChange={event => update({ title: event.currentTarget.value })}
						className={fieldClass}
					/>
				</div>
				<div className="mm-publication-field">
					<span className="mm-publication-label">
						<label htmlFor={`${fieldId}-description`}>{t('Public description')}</label>
						<Counter id={`${fieldId}-description-count`} length={form.value.description.length} max={DESCRIPTION_MAX} />
					</span>
					<textarea
						id={`${fieldId}-description`}
						value={form.value.description}
						maxLength={DESCRIPTION_MAX}
						readOnly={loading}
						rows={4}
						aria-describedby={`${fieldId}-description-count`}
						onChange={event => update({ description: event.currentTarget.value })}
						className={fieldClass}
					/>
				</div>
				<CategoryPills
					name={`publication-category-${memory.id}`}
					disabled={loading}
					value={form.value.category}
					onChange={category => update({ category })}
				/>
				<label className="mm-publication-consent">
					<input type="checkbox" checked={consent} onChange={event => setConsent(event.currentTarget.checked)} />
					<span>
						{t(
							'I want this GLB and its thumbnail to be accessible to everyone after moderation, including captured text and textures.'
						)}
					</span>
				</label>
				<p className="mm-publication-note">
					{t(
						'Every new submission replaces the publication and requires moderation again. Link sharing stays separate.'
					)}
				</p>
				{error && <p role="alert">{t(error)}</p>}
				<p role="status" className="mm-publication-notice">
					{notice ? t(notice) : ''}
				</p>
				<div className="mm-publication-actions">
					<button type="submit" className={buttonLime} disabled={busy !== null || !status || Boolean(hint)}>
						{t(submitLabel(busy === 'submit', current))}
					</button>
					{current && <WithdrawControl busy={busy !== null} onConfirm={() => void revoke()} />}
				</div>
				{hint && status && <p className="mm-publication-hint">{t(hint)}</p>}
			</form>
		</section>
	)
}
