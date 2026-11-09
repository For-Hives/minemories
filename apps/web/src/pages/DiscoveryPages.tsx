import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Pipeline, ShareDemo } from '../components/diagrams'
import { More } from '../components/explainers'
import { MemoryScene } from '../components/MemoryScene'
import { buttonLime, buttonOutline } from '../components/ui'
import { useDemoPreferences } from '../content/demo-preferences'
import { type DemoTheme, demoMemories, discoveryPages } from '../content/discovery'
import { translate } from '../i18n/catalog'
import { useI18n } from '../i18n/I18n'
import { ContentLayout, NotFoundPage } from './ContentPages'
import { PublicGallery } from './PublicCatalog'

const trailingSlash = /\/$/
/** One distinct still per path, so the four tiles never look alike. */
const pathScenes: Record<string, { theme: DemoTheme; stage?: number }> = {
	'/open-source': { theme: 'garden' },
	'/nostalgia': { theme: 'home', stage: 2 },
	'/sharing': { theme: 'village' },
	'/ranking': { theme: 'home' },
}
export function DiscoveryPage() {
	const { locale, t } = useI18n()
	return (
		<ContentLayout eyebrow="MINEMORIES / PLAYGROUND" title={t('One world. Many reasons to keep it.')}>
			<div className="mm-angle-grid mm-angle-grid--paths">
				{discoveryPages.map(page => (
					<Link key={page.path} to={page.path} className={`mm-angle-card mm-accent-${page.accent}`}>
						<MemoryScene
							theme={pathScenes[page.path]?.theme ?? 'home'}
							stage={pathScenes[page.path]?.stage}
							label={translate(locale, page.label)}
						/>
						<h2>{translate(locale, page.label)}</h2>
						<span>{t('Explore this path ↗')}</span>
					</Link>
				))}
			</div>
			<section className="mm-callout">
				<h2>{t('Start with a visit.')}</h2>
				<Link className={buttonLime} to="/explore">
					{t('Explore the gallery')}
				</Link>
			</section>
		</ContentLayout>
	)
}
const repository = 'https://github.com/For-Hives/minemories'
function OpenSourcePipeline({ points }: { points: string[] }) {
	const { t } = useI18n()
	return (
		<Pipeline
			nodes={[
				{
					id: 'mod',
					glyph: 'code',
					label: 'Mod',
					point: points[0] ?? '',
					extra: (
						<a className={buttonOutline} href={repository}>
							GitHub ↗
						</a>
					),
				},
				{ id: 'glb', glyph: 'cube', label: 'GLB', point: points[1] ?? '' },
				{
					id: 'files',
					glyph: 'disk',
					label: 'Your computer',
					point: points[2] ?? '',
					extra: (
						<a className={buttonOutline} href={`${repository}/blob/main/README.md`}>
							{t('Read the documentation')}
						</a>
					),
				},
			]}
		/>
	)
}
export function MarketingPage() {
	const { pathname } = useLocation()
	const { locale, t } = useI18n()
	const page = discoveryPages.find(item => item.path === pathname.replace(trailingSlash, ''))
	if (!page) return <NotFoundPage />
	return (
		<ContentLayout eyebrow={`MINEMORIES / ${translate(locale, page.label)}`} title={translate(locale, page.title)}>
			{page.path === '/nostalgia' && <TimelinePreview />}
			{page.path === '/open-source' && <OpenSourcePipeline points={page.points} />}
			{page.path === '/sharing' && <ShareDemo />}
			<div className="mm-actions">
				{page.path === '/sharing' && (
					<>
						<Link className={buttonOutline} to="/explore?demo=1">
							{t('View the demo')}
						</Link>
						<Link className={buttonLime} to="/gallery">
							{t('My private gallery')}
						</Link>
					</>
				)}
				{page.path !== '/sharing' && (
					<Link className={buttonLime} to="/installation">
						{t('Create my first memory')}
					</Link>
				)}
				<Link to="/discover" className={buttonOutline}>
					{t('All paths')}
				</Link>
			</div>
			<More label={t('Good to know')}>
				<p>{translate(locale, page.note)}</p>
			</More>
		</ContentLayout>
	)
}
function TimelinePreview() {
	const { t } = useI18n()
	const [stage, setStage] = useState(1)
	const labels = [t('The beginning'), t('The first evenings'), t('A small village')]
	return (
		<section className="mm-timeline-preview">
			<MemoryScene theme="home" stage={stage} label={labels[stage - 1] ?? ''} />
			<div className="ex-range-field">
				<label htmlFor="memory-timeline">{t('Memory moment')}</label>
				<input
					id="memory-timeline"
					type="range"
					min="1"
					max="3"
					value={stage}
					aria-valuetext={labels[stage - 1]}
					onChange={event => setStage(Number(event.target.value))}
				/>
				<ol className="ex-ticks">
					{labels.map((label, index) => (
						<li key={label}>
							<button type="button" aria-pressed={stage === index + 1} onClick={() => setStage(index + 1)}>
								{label}
							</button>
						</li>
					))}
				</ol>
			</div>
		</section>
	)
}
export function ExplorerPage({ ranking = false }: { ranking?: boolean }) {
	const { t } = useI18n()
	const [params] = useSearchParams()
	const demo = params.get('demo') === '1'
	const base = ranking ? '/ranking' : '/explore'
	let title = t('Memories to explore')
	if (ranking) title = t('Most loved memories')
	if (demo) title = t('A little visit, just to see.')
	return (
		<ContentLayout
			eyebrow="MINEMORIES"
			title={title}
			lead={
				demo
					? t('Illustrated demo: favorites and votes stay local.')
					: t('Memories voluntarily published and reviewed before appearing here.')
			}
		>
			<div className="mm-actions">
				<Link className={buttonOutline} to={demo ? base : `${base}?demo=1`}>
					{demo ? t('View public memories') : t('Try the demo')}
				</Link>
				<Link className={buttonLime} to="/gallery">
					{t('My private gallery')}
				</Link>
			</div>
			{demo ? <GalleryPreview ranking={ranking} /> : <PublicGallery ranking={ranking} />}
		</ContentLayout>
	)
}
export function GalleryPreview({ ranking = false }: { ranking?: boolean }) {
	const { locale, t } = useI18n()
	const [query, setQuery] = useState('')
	const [category, setCategory] = useState('all')
	const [favoritesOnly, setFavoritesOnly] = useState(false)
	const [sort, setSort] = useState(ranking ? 'hearts' : 'title')
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
					<h2>{ranking ? t('Try the favorites ranking') : t('Three places to explore')}</h2>
				</div>
				<button
					type="button"
					className="mm-text-button"
					onClick={() => {
						reset()
						setQuery('')
						setCategory('all')
						setFavoritesOnly(false)
						setSort(ranking ? 'hearts' : 'title')
						setParams({})
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
								setParams({ souvenir: memory.id })
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
						setParams({})
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
