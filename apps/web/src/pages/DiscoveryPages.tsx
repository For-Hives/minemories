import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { MemoryScene } from '../components/MemoryScene'
import { buttonLime, buttonOutline } from '../components/ui'
import { useDemoPreferences } from '../content/demo-preferences'
import { demoMemories } from '../content/discovery'
import { translate } from '../i18n/catalog'
import { useI18n } from '../i18n/I18n'
import { ContentLayout } from './ContentPages'
import { PublicGallery } from './PublicCatalog'

export function ExplorerPage() {
	const { t } = useI18n()
	const [params] = useSearchParams()
	const demo = params.get('demo') === '1'
	const title = demo ? t('A little visit, just to see.') : t('Places to visit')
	return (
		<ContentLayout
			eyebrow="MINEMORIES"
			title={title}
			lead={
				demo
					? t('Illustrated demo: favorites and votes stay local.')
					: t('Builds other players chose to share. We check each one before it goes up.')
			}
		>
			<div className="mm-actions">
				<Link className={buttonOutline} to={demo ? '/explore' : '/explore?demo=1'}>
					{demo ? t('View public memories') : t('Try the demo')}
				</Link>
				<Link className={buttonLime} to="/gallery">
					{t('My private gallery')}
				</Link>
			</div>
			{demo ? <GalleryPreview /> : <PublicGallery />}
		</ContentLayout>
	)
}
export function GalleryPreview() {
	const { locale, t } = useI18n()
	const [query, setQuery] = useState('')
	const [category, setCategory] = useState('all')
	const [favoritesOnly, setFavoritesOnly] = useState(false)
	const [sort, setSort] = useState('title')
	const { preferences, toggle, reset } = useDemoPreferences()
	const [params, setParams] = useSearchParams()
	const trigger = useRef<HTMLButtonElement | null>(null)
	const selected = demoMemories.find(memory => memory.id === params.get('souvenir'))
	const categories = [
		...new Map(demoMemories.map(memory => [memory.theme, translate(locale, memory.category)])).entries(),
	]
	const visible = demoMemories
		.filter(
			memory =>
				`${translate(locale, memory.title)} ${translate(locale, memory.story)}`
					.toLocaleLowerCase(locale)
					.includes(query.trim().toLocaleLowerCase(locale)) &&
				(category === 'all' || memory.theme === category) &&
				(!favoritesOnly || preferences.favorites.includes(memory.id))
		)
		.sort((a, b) =>
			sort === 'hearts'
				? b.hearts + Number(preferences.votes.includes(b.id)) - a.hearts - Number(preferences.votes.includes(a.id))
				: translate(locale, a.title).localeCompare(translate(locale, b.title), locale)
		)
	return (
		<section className="mm-demo-gallery" aria-label={t('Demo gallery')}>
			<div className="mm-section-heading">
				<div>
					<span className="mm-kicker">{t('Demo · sample data')}</span>
					<h2>{t('Three places to explore')}</h2>
				</div>
				<button
					type="button"
					className="mm-text-button"
					onClick={() => {
						reset()
						setQuery('')
						setCategory('all')
						setFavoritesOnly(false)
						setSort('title')
						setParams({ demo: '1' })
					}}
				>
					{t('Reset demo')}
				</button>
			</div>
			<div className="mm-demo-toolbar">
				<label>
					{t('Search places')}
					<input
						type="search"
						value={query}
						onChange={event => setQuery(event.target.value)}
						placeholder={t('House, garden…')}
					/>
				</label>
				<label>
					{t('Theme')}
					<select value={category} onChange={event => setCategory(event.target.value)}>
						<option value="all">{t('All themes')}</option>
						{categories.map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</label>
				<label>
					{t('Sort by')}
					<select value={sort} onChange={event => setSort(event.target.value)}>
						<option value="title">{t('Place name')}</option>
						<option value="hearts">{t('Hearts')}</option>
					</select>
				</label>
				<button
					className={buttonOutline}
					type="button"
					aria-pressed={favoritesOnly}
					onClick={() => setFavoritesOnly(!favoritesOnly)}
				>
					{t('My favorites')} ({preferences.favorites.length})
				</button>
			</div>
			<p role="status" className="mm-fineprint">
				{visible.length} {t('place(s) · favorites and votes saved on this device only')}
			</p>
			<div className="mm-demo-grid">
				{visible.map((memory, index) => (
					<article key={memory.id} className="mm-memory-card">
						<button
							type="button"
							className="mm-scene-button"
							aria-label={`${t('Visit')} ${translate(locale, memory.title)}`}
							onClick={event => {
								trigger.current = event.currentTarget
								setParams({ demo: '1', souvenir: memory.id })
							}}
						>
							<MemoryScene theme={memory.theme} label={t('Demo illustration')} />
							{sort === 'hearts' && <span className="mm-rank">#{index + 1}</span>}
						</button>
						<div className="mm-memory-card-body">
							<span className="mm-kicker">{translate(locale, memory.category)}</span>
							<h3>{translate(locale, memory.title)}</h3>
							<p>{translate(locale, memory.story)}</p>
							<div className="mm-memory-actions">
								<button
									className="mm-text-button"
									type="button"
									aria-pressed={preferences.favorites.includes(memory.id)}
									aria-label={`${t('Favorite')} : ${translate(locale, memory.title)}`}
									onClick={() => toggle('favorites', memory.id)}
								>
									{preferences.favorites.includes(memory.id) ? '★' : '☆'} {t('Keep')}
								</button>
								<button
									className="mm-text-button"
									type="button"
									aria-pressed={preferences.votes.includes(memory.id)}
									aria-label={`${t('Heart')} : ${translate(locale, memory.title)}`}
									onClick={() => toggle('votes', memory.id)}
								>
									♡ {memory.hearts + Number(preferences.votes.includes(memory.id))}
								</button>
							</div>
						</div>
					</article>
				))}
			</div>
			{visible.length === 0 && (
				<div className="mm-empty-demo">
					<h3>{t('No places match these filters.')}</h3>
					<p>{t('Try another word or remove the favorites filter.')}</p>
				</div>
			)}
			{selected && (
				<DemoDetail
					key={selected.id}
					memory={selected}
					close={() => {
						setParams({ demo: '1' })
						trigger.current?.focus()
					}}
				/>
			)}
		</section>
	)
}
function DemoDetail({ memory, close }: { memory: (typeof demoMemories)[number]; close: () => void }) {
	const { locale, t } = useI18n()
	const [link, setLink] = useState('')
	const [copied, setCopied] = useState(false)
	const heading = useRef<HTMLHeadingElement>(null)
	useEffect(() => {
		heading.current?.focus({ preventScroll: true })
		heading.current?.scrollIntoView({ block: 'center', behavior: 'instant' })
	}, [])
	async function share() {
		const url = new URL('/explore', window.location.origin)
		url.searchParams.set('demo', '1')
		url.searchParams.set('souvenir', memory.id)
		setLink(url.href)
		try {
			await navigator.clipboard.writeText(url.href)
			setCopied(true)
		} catch {
			setCopied(false)
		}
	}
	return (
		<section className="mm-demo-detail" aria-label={t('Memory preview')}>
			<div>
				<span className="mm-kicker">{t('Illustration · shareable preview')}</span>
				<h2 ref={heading} tabIndex={-1}>
					{translate(locale, memory.title)}
				</h2>
				<p>{translate(locale, memory.story)}</p>
				<p>{t('This link opens this illustration. Share your real memories from your private gallery.')}</p>
				<div className="mm-actions">
					<button
						type="button"
						className={buttonLime}
						onClick={() => {
							void share()
						}}
					>
						{t('Copy demo link')}
					</button>
					<button type="button" className={buttonOutline} onClick={close}>
						{t('Close preview')}
					</button>
				</div>
				{link && (
					<label className="mm-share-result">
						<span role="status">{copied ? t('Link copied') : t('Select the link to copy it')}</span>
						<input readOnly value={link} onFocus={event => event.currentTarget.select()} />
					</label>
				)}
			</div>
			<MemoryScene theme={memory.theme} label={translate(locale, memory.title)} />
		</section>
	)
}
