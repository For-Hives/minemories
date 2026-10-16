import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { OrbitMark } from '../components/Loading'
import { buttonLime, buttonOutline, Eyebrow } from '../components/ui'
import { articles, legalContent } from '../content/site-content'
import { useI18n } from '../i18n/I18n'
import { WebDiagnosticsPreference } from '../observability/WebObservability'

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
				<OrbitMark />
			</header>
			{children}
		</article>
	)
}
export function BlogPage() {
	const { locale } = useI18n()
	return (
		<ContentLayout
			eyebrow="MINEMORIES"
			title={locale === 'fr' ? 'Le journal des souvenirs' : 'The memory journal'}
			lead={
				locale === 'fr'
					? 'Des repères pour capturer, garder et revisiter les lieux construits ensemble.'
					: 'Ideas for capturing, keeping and revisiting the places built together.'
			}
		>
			<div className="mm-content-grid">
				{articles.map(article => (
					<Link className="mm-editorial-card" key={article.slug} to={`/blog/${article.slug}`}>
						<OrbitMark />
						<time dateTime={article.published}>
							{new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
								new Date(`${article.published}T12:00:00Z`)
							)}
						</time>
						<h2>{article.title[locale]}</h2>
						<p>{article.summary[locale]}</p>
						<span>{locale === 'fr' ? 'Lire l’article →' : 'Read article →'}</span>
					</Link>
				))}
			</div>
		</ContentLayout>
	)
}
export function ArticlePage() {
	const { locale } = useI18n()
	const { slug } = useParams()
	const article = articles.find(item => item.slug === slug)
	if (!article) return <NotFoundPage />
	return (
		<ContentLayout eyebrow="JOURNAL" title={article.title[locale]} lead={article.summary[locale]}>
			<time dateTime={article.published}>
				{new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
					new Date(`${article.published}T12:00:00Z`)
				)}
			</time>
			<div className="mm-prose">
				{article.sections.map(section => (
					<section key={section.heading.en}>
						<h2>{section.heading[locale]}</h2>
						<p>{section.body[locale]}</p>
					</section>
				))}
			</div>
			<Link className={buttonLime} to="/installation">
				{locale === 'fr' ? 'Créer mon premier souvenir' : 'Create my first memory'}
			</Link>
			<p>
				<Link to="/blog">{locale === 'fr' ? '← Retour au journal' : '← Back to the journal'}</Link>
			</p>
		</ContentLayout>
	)
}
export function LegalPage({ kind }: { kind: keyof typeof legalContent }) {
	const { locale } = useI18n()
	const content = legalContent[kind]
	return (
		<ContentLayout eyebrow="MINEMORIES" title={content.title[locale]}>
			<div className="mm-prose">
				{content.sections.map(section => (
					<section key={section.heading.en}>
						<h2>{section.heading[locale]}</h2>
						<p>{section.body[locale]}</p>
						{kind === 'privacy' && section.heading.en === 'Optional web diagnostics' && <WebDiagnosticsPreference />}
					</section>
				))}
			</div>
			<p>
				<a href="https://github.com/For-Hives/minemories">
					{locale === 'fr' ? 'Dépôt du projet' : 'Project repository'}
				</a>
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
