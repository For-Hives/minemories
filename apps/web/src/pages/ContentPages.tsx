import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { OrbitMark } from '../components/Loading'
import { buttonLime, buttonOutline, Eyebrow } from '../components/ui'
import { articles, legalContent, pricingPlans } from '../content/site-content'
import { useI18n } from '../i18n/I18n'

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
			<time dateTime={article.published}>{article.published}</time>
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
export function PricingPage() {
	const { locale } = useI18n()
	const experimentalLabel = locale === 'fr' ? 'Version expérimentale' : 'Experimental version'
	return (
		<ContentLayout
			eyebrow="MINEMORIES"
			title={locale === 'fr' ? 'Une place pour tes souvenirs' : 'A place for your memories'}
			lead={
				locale === 'fr'
					? 'Le projet est expérimental. Aucun abonnement ni tarif commercial n’est annoncé pour le moment.'
					: 'The project is experimental. No subscription or commercial price is announced yet.'
			}
		>
			<div className="mm-content-grid">
				{pricingPlans.map(plan => (
					<section className="mm-editorial-card" key={plan.id}>
						<h2>{plan.title[locale]}</h2>
						<p>{plan.description[locale]}</p>
						<p className="mm-price">
							{plan.price === null
								? experimentalLabel
								: new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(plan.price)}
						</p>
						<ul>
							{plan.features[locale].map(feature => (
								<li key={feature}>{feature}</li>
							))}
						</ul>
						<Link className={buttonLime} to="/installation">
							{locale === 'fr' ? 'Installer le mod' : 'Install the mod'}
						</Link>
					</section>
				))}
			</div>
			<p className="mm-note">
				{locale === 'fr'
					? 'La capture 3D complète ta sauvegarde Minecraft. Garde aussi les fichiers locaux : aucune conservation en ligne à vie n’est promise.'
					: 'A 3D capture complements your Minecraft backup. Keep your local files too: lifetime online storage is not promised.'}
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
