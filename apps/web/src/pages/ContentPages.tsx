import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { BrandLogo } from '../components/BrandMark'
import { DataFlow, RadiusMap } from '../components/diagrams'
import { FileTree, Glyph, type GlyphName } from '../components/explainers'
import { BlockMark } from '../components/Loading'
import { MemoryScene } from '../components/MemoryScene'
import { buttonLime, buttonOutline, Eyebrow } from '../components/ui'
import { type ArticleVisual, articles, legalContent } from '../content/site-content'
import { translate } from '../i18n/catalog'
import { useI18n } from '../i18n/I18n'
import { WebDiagnosticsPreference } from '../observability/WebObservability'
import { catalogLinks } from './installation-loaders'

export function ContentLayout({
	eyebrow,
	title,
	lead,
	children,
}: {
	eyebrow: string
	title: string
	lead?: string
	children: ReactNode
}) {
	return (
		<article className="mm-content">
			<header className="mm-content-header">
				<div>
					<Eyebrow>{eyebrow}</Eyebrow>
					<h1>{title}</h1>
					{lead && <p>{lead}</p>}
				</div>
				<BrandLogo className="mm-content-logo" />
			</header>
			{children}
		</article>
	)
}
export function BlogPage() {
	const { locale, t } = useI18n()
	return (
		<ContentLayout
			eyebrow="MINEMORIES"
			title={t('The memory journal')}
			lead={t('Ideas for capturing, keeping and revisiting the places built together.')}
		>
			<div className="mm-content-grid">
				{articles.map(article => (
					<Link className="mm-editorial-card" key={article.slug} to={`/blog/${article.slug}`}>
						<BlockMark />
						<time dateTime={article.published}>
							{new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
								new Date(`${article.published}T12:00:00Z`)
							)}
						</time>
						<h2>{translate(locale, article.title)}</h2>
						<p>{translate(locale, article.summary)}</p>
						<span>{t('Read article →')}</span>
					</Link>
				))}
			</div>
		</ContentLayout>
	)
}
export function ArticlePage() {
	const { locale, t } = useI18n()
	const { slug } = useParams()
	const article = articles.find(item => item.slug === slug)
	if (!article) return <NotFoundPage />
	return (
		<ContentLayout eyebrow="JOURNAL" title={translate(locale, article.title)} lead={translate(locale, article.summary)}>
			<time dateTime={article.published}>
				{new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
					new Date(`${article.published}T12:00:00Z`)
				)}
			</time>
			<div className="ex-story">
				{article.sections.map(section => (
					<section key={section.heading} className="ex-story-block">
						<div className="ex-story-visual">
							<StoryVisual visual={section.visual} label={translate(locale, section.heading)} />
						</div>
						<div className="ex-story-text">
							<h2>{translate(locale, section.heading)}</h2>
							<p>{translate(locale, section.body)}</p>
						</div>
					</section>
				))}
			</div>
			<Link className={buttonLime} to="/installation">
				{t('Create my first memory')}
			</Link>
			<p>
				<Link className="mc-link" to="/blog">
					{t('← Back to the journal')}
				</Link>
			</p>
		</ContentLayout>
	)
}
function StoryVisual({ visual, label }: { visual: ArticleVisual; label: string }) {
	if (visual.kind === 'scene') return <MemoryScene theme={visual.theme} label={label} />
	if (visual.kind === 'radius') return <RadiusMap />
	return <FileTree />
}

/** What each privacy section is about, as a pictogram and a status read before the fine print. */
const privacySummary: Record<string, { glyph: GlyphName; status: string }> = {
	'Preferences on this device': { glyph: 'disk', status: 'Stays on this device' },
	'Optional web diagnostics': { glyph: 'view', status: 'Off by default' },
	'Diagnostics in the Minecraft mod': { glyph: 'code', status: 'Nothing sent before pairing' },
	'Account and gallery': { glyph: 'lock', status: 'Private by default' },
	'Links and deletion': { glyph: 'link', status: 'You control the link' },
	'Mod download list': { glyph: 'download', status: 'No account needed' },
}
const privacyNodes = [
	{ glyph: 'disk', label: 'Your computer' },
	{ glyph: 'lock', label: 'Your private gallery' },
	{ glyph: 'globe', label: 'Anyone with your link' },
] satisfies Array<{ glyph: GlyphName; label: string }>
const privacyEdges = [
	{ glyph: 'key', label: '6-digit code' },
	{ glyph: 'link', label: 'A link you create' },
] satisfies Array<{ glyph: GlyphName; label: string }>

function PrivacyPanels({ sections }: { sections: Array<{ heading: string; body: string }> }) {
	const { locale, t } = useI18n()
	return (
		<>
			<DataFlow nodes={privacyNodes} edges={privacyEdges} />
			<div className="ex-rows">
				{sections.map(section => {
					const summary = privacySummary[section.heading]
					return (
						<details key={section.heading} className="ex-row">
							<summary>
								<Glyph name={summary?.glyph ?? 'lock'} />
								<h2>{translate(locale, section.heading)}</h2>
								{summary && <span className="ex-chip">{t(summary.status)}</span>}
							</summary>
							<div className="ex-row-body">
								<p>{translate(locale, section.body)}</p>
								{section.heading === 'Optional web diagnostics' && <WebDiagnosticsPreference />}
							</div>
						</details>
					)
				})}
			</div>
		</>
	)
}

export function LegalPage({ kind }: { kind: keyof typeof legalContent }) {
	const { locale, t } = useI18n()
	const content = legalContent[kind]
	return (
		<ContentLayout eyebrow="MINEMORIES" title={translate(locale, content.title)}>
			{kind === 'privacy' ? (
				<PrivacyPanels sections={content.sections} />
			) : (
				<div className="mm-prose">
					{content.sections.map(section => (
						<section key={section.heading}>
							<h2>{translate(locale, section.heading)}</h2>
							<p>{translate(locale, section.body)}</p>
						</section>
					))}
				</div>
			)}
			<p>
				<a className="mc-link" href="https://github.com/For-Hives/minemories">
					{t('Project repository')}
				</a>
				{catalogLinks().map(catalog => (
					<span key={catalog.name}>
						{' · '}
						<a className="mc-link" href={catalog.url}>
							{catalog.name}
						</a>
					</span>
				))}
			</p>
		</ContentLayout>
	)
}
export function NotFoundPage() {
	const { t } = useI18n()
	return (
		<ContentLayout
			eyebrow="404"
			title={t('Page not found')}
			lead={t('This address does not lead to a Minemories page.')}
		>
			<Link className={buttonOutline} to="/">
				{t('Back home')}
			</Link>
		</ContentLayout>
	)
}
