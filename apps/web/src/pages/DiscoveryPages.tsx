import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { MemoryScene } from '../components/MemoryScene'
import { buttonLime, buttonOutline } from '../components/ui'
import { useDemoPreferences } from '../content/demo-preferences'
import { demoMemories, discoveryPages } from '../content/discovery'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'
import { ContentLayout, NotFoundPage } from './ContentPages'
import { PublicGallery } from './PublicDiscovery'

const trailingSlash = /\/$/
export function DiscoveryPage() {
	const { locale, copy } = useLocalizedCopy()
	return (
		<ContentLayout
			eyebrow="MINEMORIES / PLAYGROUND"
			title={copy('Un monde. Plusieurs raisons de le garder.', 'One world. Many reasons to keep it.')}
			lead={copy(
				'Choisis ce qui te parle. Les parcours et les démonstrations sont accessibles sans compte.',
				'Pick what speaks to you. Explore the journeys and demos without an account.'
			)}
		>
			<div className="mm-angle-grid">
				{discoveryPages.map((page, index) => (
					<Link key={page.path} to={page.path} className={`mm-angle-card mm-accent-${page.accent}`}>
						<span className="mm-kicker">
							0{index + 1} / {page.label[locale]}
						</span>
						<MemoryScene theme={index % 2 ? 'home' : 'village'} label={page.label[locale]} />
						<h2>{page.title[locale]}</h2>
						<p>{page.lead[locale]}</p>
						<span>{copy('Découvrir ce parcours ↗', 'Explore this path ↗')}</span>
					</Link>
				))}
			</div>
			<section className="mm-callout">
				<div>
					<h2>{copy('Commence par une visite.', 'Start with a visit.')}</h2>
					<p>
						{copy(
							'Des souvenirs publics à visiter, et une démonstration séparée pour essayer.',
							'Public memories to visit, with a separate demo to try.'
						)}
					</p>
				</div>
				<Link className={buttonLime} to="/explorer">
					{copy('Explorer la galerie', 'Explore the gallery')}
				</Link>
			</section>
		</ContentLayout>
	)
}
export function MarketingPage() {
	const { pathname } = useLocation()
	const { locale, copy } = useLocalizedCopy()
	const page = discoveryPages.find(item => item.path === pathname.replace(trailingSlash, ''))
	if (!page) return <NotFoundPage />
	return (
		<ContentLayout eyebrow={`MINEMORIES / ${page.label[locale]}`} title={page.title[locale]} lead={page.lead[locale]}>
			<div className={`mm-story-hero mm-accent-${page.accent}`}>
				<MemoryScene
					theme={page.path === '/nostalgie' ? 'home' : 'village'}
					label={copy('Illustration d’un petit monde Minecraft', 'Illustration of a small Minecraft world')}
				/>
				<div>
					<span className="mm-kicker">{copy('Ce qu’on veut garder', 'What we want to keep')}</span>
					<ul className="mm-feature-list">
						{page.points.map(point => (
							<li key={point.en}>{point[locale]}</li>
						))}
					</ul>
					<p>{page.story[locale]}</p>
					<Link className={buttonLime} to="/installation">
						{copy('Créer mon premier souvenir', 'Create my first memory')}
					</Link>
				</div>
			</div>
			{page.path === '/nostalgie' && <TimelinePreview />}
			{page.path === '/open-source' && (
				<section className="mm-callout">
					<div>
						<h2>{copy('Entre dans les coulisses.', 'Look behind the scenes.')}</h2>
						<p>
							{copy(
								'Le code, les releases, les discussions et les instructions de développement sont publics.',
								'Code, releases, discussions and development instructions are public.'
							)}
						</p>
					</div>
					<div className="mm-actions">
						<a className={buttonOutline} href="https://github.com/For-Hives/minemories">
							GitHub ↗
						</a>
						<a className={buttonOutline} href="https://github.com/For-Hives/minemories/blob/main/README.md">
							{copy('Lire la documentation', 'Read the documentation')}
						</a>
					</div>
				</section>
			)}
			{page.path === '/partager' && (
				<section className="mm-callout">
					<div>
						<h2>{copy('Essaie, puis crée ta propre galerie.', 'Try it, then create your own gallery.')}</h2>
						<p>
							{copy(
								'La démo ne demande rien. Ton espace personnel demande un compte et conserve tes captures privées.',
								'The demo needs nothing. Your own space requires an account and keeps your captures private.'
							)}
						</p>
					</div>
					<div className="mm-actions">
						<Link className={buttonOutline} to="/explorer?demo=1">
							{copy('Voir la démo', 'View the demo')}
						</Link>
						<Link className={buttonLime} to="/gallery">
							{copy('Ma galerie privée', 'My private gallery')}
						</Link>
					</div>
				</section>
			)}
			{page.path === '/classement' && <GalleryPreview ranking />}
			<p className="mm-note">{page.note[locale]}</p>
			<div className="mm-actions">
				<Link to="/decouvrir" className={buttonOutline}>
					{copy('Tous les parcours', 'All paths')}
				</Link>
				<Link to="/pricing" className={buttonOutline}>
					{copy('Préparer mon budget', 'Plan my budget')}
				</Link>
			</div>
		</ContentLayout>
	)
}
function TimelinePreview() {
	const { copy } = useLocalizedCopy()
	const [stage, setStage] = useState(1)
	const labels = copy(
		['Le début', 'Les premières soirées', 'Un petit village'],
		['The beginning', 'The first evenings', 'A small village']
	)
	return (
		<section className="mm-timeline-preview">
			<div>
				<span className="mm-kicker">{copy('Illustration interactive', 'Interactive illustration')}</span>
				<h2>{copy('Les lieux changent. Le souvenir reste.', 'Places change. The memory stays.')}</h2>
				<p>
					{copy(
						'Déplace le curseur pour imaginer trois étapes d’une construction.',
						'Move the slider to imagine three stages of a build.'
					)}
				</p>
				<label htmlFor="memory-timeline">{copy('Moment du souvenir', 'Memory moment')}</label>
				<input
					id="memory-timeline"
					type="range"
					min="1"
					max="3"
					value={stage}
					onChange={event => setStage(Number(event.target.value))}
				/>
				<output htmlFor="memory-timeline" aria-live="polite">
					{labels[stage - 1]}
				</output>
			</div>
			<MemoryScene theme="village" stage={stage} label={labels[stage - 1] ?? ''} />
		</section>
	)
}
export function ExplorerPage({ ranking = false }: { ranking?: boolean }) {
	const { copy } = useLocalizedCopy()
	const [params] = useSearchParams()
	const demo = params.get('demo') === '1'
	const base = ranking ? '/classement' : '/explorer'
	let title = copy('Souvenirs à explorer', 'Memories to explore')
	if (ranking) title = copy('Les coups de cœur', 'Most loved memories')
	if (demo) title = copy('Une petite visite, pour voir.', 'A little visit, just to see.')
	return (
		<ContentLayout
			eyebrow="MINEMORIES"
			title={title}
			lead={
				demo
					? copy(
							'Démonstration illustrée : favoris et votes restent locaux.',
							'Illustrated demo: favorites and votes stay local.'
						)
					: copy(
							'Des souvenirs publiés volontairement et examinés avant leur mise en ligne.',
							'Memories voluntarily published and reviewed before appearing here.'
						)
			}
		>
			<div className="mm-actions">
				<Link className={buttonOutline} to={demo ? base : `${base}?demo=1`}>
					{demo
						? copy('Voir les souvenirs publics', 'View public memories')
						: copy('Essayer la démonstration', 'Try the demo')}
				</Link>
				<Link className={buttonLime} to="/gallery">
					{copy('Ma galerie privée', 'My private gallery')}
				</Link>
			</div>
			{demo ? <GalleryPreview ranking={ranking} /> : <PublicGallery ranking={ranking} />}
		</ContentLayout>
	)
}
export function GalleryPreview({ ranking = false }: { ranking?: boolean }) {
	const { locale, copy } = useLocalizedCopy()
	const [query, setQuery] = useState('')
	const [category, setCategory] = useState('all')
	const [favoritesOnly, setFavoritesOnly] = useState(false)
	const [sort, setSort] = useState(ranking ? 'hearts' : 'title')
	const { preferences, toggle, reset } = useDemoPreferences()
	const [params, setParams] = useSearchParams()
	const trigger = useRef<HTMLButtonElement | null>(null)
	const selected = demoMemories.find(memory => memory.id === params.get('souvenir'))
	const categories = [...new Map(demoMemories.map(memory => [memory.theme, memory.category[locale]])).entries()]
	const visible = demoMemories
		.filter(
			memory =>
				`${memory.title[locale]} ${memory.story[locale]}`
					.toLocaleLowerCase(locale)
					.includes(query.trim().toLocaleLowerCase(locale)) &&
				(category === 'all' || memory.theme === category) &&
				(!favoritesOnly || preferences.favorites.includes(memory.id))
		)
		.sort((a, b) =>
			sort === 'hearts'
				? b.hearts + Number(preferences.votes.includes(b.id)) - a.hearts - Number(preferences.votes.includes(a.id))
				: a.title[locale].localeCompare(b.title[locale], locale)
		)
	return (
		<section className="mm-demo-gallery" aria-label={copy('Galerie de démonstration', 'Demo gallery')}>
			<div className="mm-section-heading">
				<div>
					<span className="mm-kicker">{copy('Démonstration · données d’exemple', 'Demo · sample data')}</span>
					<h2>
						{ranking
							? copy('Les coups de cœur, pour essayer', 'Try the favorites ranking')
							: copy('Trois lieux à explorer', 'Three places to explore')}
					</h2>
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
					{copy('Réinitialiser la démo', 'Reset demo')}
				</button>
			</div>
			<div className="mm-demo-toolbar">
				<label>
					{copy('Rechercher un lieu', 'Search places')}
					<input
						type="search"
						value={query}
						onChange={event => setQuery(event.target.value)}
						placeholder={copy('Maison, jardin…', 'House, garden…')}
					/>
				</label>
				<label>
					{copy('Thème', 'Theme')}
					<select value={category} onChange={event => setCategory(event.target.value)}>
						<option value="all">{copy('Tous les thèmes', 'All themes')}</option>
						{categories.map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</label>
				<label>
					{copy('Trier par', 'Sort by')}
					<select value={sort} onChange={event => setSort(event.target.value)}>
						<option value="title">{copy('Nom du lieu', 'Place name')}</option>
						<option value="hearts">{copy('Coups de cœur', 'Hearts')}</option>
					</select>
				</label>
				<button
					className={buttonOutline}
					type="button"
					aria-pressed={favoritesOnly}
					onClick={() => setFavoritesOnly(!favoritesOnly)}
				>
					{copy('Mes favoris', 'My favorites')} ({preferences.favorites.length})
				</button>
			</div>
			<p role="status" className="mm-fineprint">
				{visible.length}{' '}
				{copy(
					'lieu(x) · favoris et votes enregistrés sur cet appareil seulement',
					'place(s) · favorites and votes saved on this device only'
				)}
			</p>
			<div className="mm-demo-grid">
				{visible.map((memory, index) => (
					<article key={memory.id} className="mm-memory-card">
						<button
							type="button"
							className="mm-scene-button"
							aria-label={`${copy('Visiter', 'Visit')} ${memory.title[locale]}`}
							onClick={event => {
								trigger.current = event.currentTarget
								setParams({ souvenir: memory.id })
							}}
						>
							<MemoryScene theme={memory.theme} label={copy('Illustration de démonstration', 'Demo illustration')} />
							{sort === 'hearts' && <span className="mm-rank">#{index + 1}</span>}
						</button>
						<div className="mm-memory-card-body">
							<span className="mm-kicker">{memory.category[locale]}</span>
							<h3>{memory.title[locale]}</h3>
							<p>{memory.story[locale]}</p>
							<div className="mm-memory-actions">
								<button
									className="mm-text-button"
									type="button"
									aria-pressed={preferences.favorites.includes(memory.id)}
									aria-label={`${copy('Favori', 'Favorite')} : ${memory.title[locale]}`}
									onClick={() => toggle('favorites', memory.id)}
								>
									{preferences.favorites.includes(memory.id) ? '★' : '☆'} {copy('Garder', 'Keep')}
								</button>
								<button
									className="mm-text-button"
									type="button"
									aria-pressed={preferences.votes.includes(memory.id)}
									aria-label={`${copy('Coup de cœur', 'Heart')} : ${memory.title[locale]}`}
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
					<h3>{copy('Aucun lieu pour ces filtres.', 'No places match these filters.')}</h3>
					<p>
						{copy(
							'Essaie un autre mot ou enlève le filtre des favoris.',
							'Try another word or remove the favorites filter.'
						)}
					</p>
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
	const { locale, copy } = useLocalizedCopy()
	const [link, setLink] = useState('')
	const [copied, setCopied] = useState(false)
	const heading = useRef<HTMLHeadingElement>(null)
	useEffect(() => {
		heading.current?.focus({ preventScroll: true })
		heading.current?.scrollIntoView({ block: 'center', behavior: 'instant' })
	}, [])
	async function share() {
		const url = new URL('/explorer', window.location.origin)
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
		<section className="mm-demo-detail" aria-label={copy('Aperçu du souvenir', 'Memory preview')}>
			<div>
				<span className="mm-kicker">
					{copy('Illustration · aperçu partageable', 'Illustration · shareable preview')}
				</span>
				<h2 ref={heading} tabIndex={-1}>
					{memory.title[locale]}
				</h2>
				<p>{memory.story[locale]}</p>
				<p>
					{copy(
						'Ce lien ouvre cette illustration. Tes vrais souvenirs se partagent depuis ta galerie privée.',
						'This link opens this illustration. Share your real memories from your private gallery.'
					)}
				</p>
				<div className="mm-actions">
					<button
						type="button"
						className={buttonLime}
						onClick={() => {
							void share()
						}}
					>
						{copy('Copier le lien de la démo', 'Copy demo link')}
					</button>
					<button type="button" className={buttonOutline} onClick={close}>
						{copy('Fermer l’aperçu', 'Close preview')}
					</button>
				</div>
				{link && (
					<label className="mm-share-result">
						<span role="status">
							{copied
								? copy('Lien copié', 'Link copied')
								: copy('Sélectionne le lien pour le copier', 'Select the link to copy it')}
						</span>
						<input readOnly value={link} onFocus={event => event.currentTarget.select()} />
					</label>
				)}
			</div>
			<MemoryScene theme={memory.theme} label={memory.title[locale]} />
		</section>
	)
}
