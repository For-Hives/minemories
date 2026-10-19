import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { OrbitMark } from '../components/Loading'
import { buttonLime, buttonOutline, Eyebrow } from '../components/ui'
import { articles, legalContent } from '../content/site-content'
import { translate } from '../i18n/catalog'
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
						<OrbitMark />
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
			<div className="mm-prose">
				{article.sections.map(section => (
					<section key={section.heading}>
						<h2>{translate(locale, section.heading)}</h2>
						<p>{translate(locale, section.body)}</p>
					</section>
				))}
			</div>
			<Link className={buttonLime} to="/installation">
				{t('Create my first memory')}
			</Link>
			<p>
				<Link to="/blog">{t('← Back to the journal')}</Link>
			</p>
		</ContentLayout>
	)
}
export function LegalPage({ kind }: { kind: keyof typeof legalContent }) {
	const { locale, t } = useI18n()
	const content = legalContent[kind]
	return (
		<ContentLayout eyebrow="MINEMORIES" title={translate(locale, content.title)}>
			<div className="mm-prose">
				{content.sections.map(section => (
					<section key={section.heading}>
						<h2>{translate(locale, section.heading)}</h2>
						<p>{translate(locale, section.body)}</p>
						{kind === 'privacy' && section.heading === 'Optional web diagnostics' && <WebDiagnosticsPreference />}
					</section>
				))}
			</div>
			<p>
				<a href="https://github.com/For-Hives/minemories">{t('Project repository')}</a>
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
