import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { BrandLogo } from '../components/BrandMark'
import { DataFlow } from '../components/diagrams'
import { Glyph, type GlyphName } from '../components/explainers'
import { buttonOutline, Eyebrow } from '../components/ui'
import { legalContent } from '../content/site-content'
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
			<ul className="ex-parents">
				<li>{t('Nothing goes online until the game is connected to an account.')}</li>
				<li>{t('Once connected, the memories go to a private gallery.')}</li>
				<li>{t('Nobody sees them without a link you create.')}</li>
			</ul>
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
