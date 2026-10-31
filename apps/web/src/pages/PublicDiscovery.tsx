import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { apiClient } from '../api-client'
import { buttonLime, buttonOutline } from '../components/ui'
import { useI18n } from '../i18n/I18n'

type Capture = Awaited<ReturnType<typeof apiClient.discovery.get>>
type Category = Capture['category']
type Publication = Awaited<ReturnType<typeof apiClient.discovery.status>>
const fieldClass = 'min-h-10 w-full rounded-md border border-[#354238] bg-[#141c16] px-3 py-2 text-ink'
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

export function PublicationPanel({
	memory,
}: {
	memory: { id: string; name: string; metadata: { thumbnail: string | null } }
}) {
	const { t } = useI18n()
	const labels = useCategoryLabels()
	const panel = useRef<HTMLElement>(null)
	useEffect(() => {
		panel.current?.focus({ preventScroll: true })
		panel.current?.scrollIntoView?.({ block: 'nearest' })
	}, [])
	const [status, setStatus] = useState<Publication | null>(null)
	const [title, setTitle] = useState(memory.name.slice(0, 80))
	const [description, setDescription] = useState('')
	const [category, setCategory] = useState<Category>('build')
	const [consent, setConsent] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	useEffect(() => {
		let live = true
		apiClient.discovery
			.status({ memoryId: memory.id })
			.then(result => {
				if (live) setStatus(result)
			})
			.catch(() => {
				if (live) setError(t('Publication status unavailable.'))
			})
		return () => {
			live = false
		}
	}, [memory.id, t])
	async function change(revoke: boolean) {
		setBusy(true)
		setError('')
		try {
			let result: Publication
			if (revoke) result = await apiClient.discovery.revoke({ memoryId: memory.id })
			else
				result = await apiClient.discovery.publish({
					memoryId: memory.id,
					title,
					description,
					category,
					thumbnail: memory.metadata.thumbnail,
					consent: true,
				})
			setStatus(result)
			setConsent(false)
		} catch {
			setError(t('Publication refused or limit reached. Try again later.'))
		} finally {
			setBusy(false)
		}
	}
	const states = {
		private: t('Private'),
		pending: t('Awaiting moderation'),
		approved: t('Published'),
		rejected: t('publication.state.rejected'),
		revoked: t('Withdrawn'),
	}
	return (
		<section
			ref={panel}
			tabIndex={-1}
			aria-label={t('Public publication')}
			className="mt-4 grid gap-3 border-t border-[#354238] pt-3"
		>
			<h4>{t('Publish in the public gallery')}</h4>
			{status && (
				<p role="status">
					{states[status.state]}
					{status.reason && ` · ${status.reason}`}
				</p>
			)}
			{error && <p role="alert">{error}</p>}
			{status?.state === 'approved' && status.id && <Link to={`/public/${status.id}`}>{t('View publication')}</Link>}
			<label className="grid gap-2">
				{t('Public title')}
				<input value={title} maxLength={80} onChange={event => setTitle(event.target.value)} className={fieldClass} />
			</label>
			<label className="grid gap-2">
				{t('Public description')}
				<textarea
					value={description}
					maxLength={500}
					onChange={event => setDescription(event.target.value)}
					className={fieldClass}
				/>
			</label>
			<label className="grid gap-2">
				{t('Public category')}
				<select className={fieldClass} value={category} onChange={event => setCategory(event.target.value as Category)}>
					{categories.map(value => (
						<option value={value} key={value}>
							{labels[value]}
						</option>
					))}
				</select>
			</label>
			<label className="flex gap-2">
				<input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
				{t(
					'I want this GLB and its thumbnail to be accessible to everyone after moderation, including captured text and textures.'
				)}
			</label>
			<p>
				{t('Every new submission replaces the publication and requires moderation again. Link sharing stays separate.')}
			</p>
			<button
				type="button"
				className={buttonLime}
				disabled={busy || !status || !consent || !title.trim()}
				onClick={() => void change(false)}
			>
				{t('Submit for moderation')}
			</button>
			{status && ['pending', 'approved', 'rejected'].includes(status.state) && (
				<button type="button" className={buttonOutline} disabled={busy} onClick={() => void change(true)}>
					{t('Withdraw publication')}
				</button>
			)}
		</section>
	)
}
