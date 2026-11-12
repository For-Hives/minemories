import { Link } from 'react-router'
import { useAppContext } from '../app-context'
import { elsewhereLinks, type FooterLink, footerGroups } from '../content/navigation'
import { useI18n } from '../i18n/I18n'
import { BrandMark } from './BrandMark'
import { DiagnosticsAccessLink } from './DiagnosticsAccessLink'

/** The link home: the logo alone in the header (`solo`), the small mark and the word Minemories in the footer. */
export function Brand({ solo = false }: { solo?: boolean }) {
	return (
		<Link className="mm-brand" to="/" aria-label="Minemories">
			<BrandMark solo={solo} />
			{!solo && <span>Minemories</span>}
		</Link>
	)
}

/** A footer link: a page of the site, or an outside address. */
function FooterAnchor({ link }: { link: FooterLink }) {
	const { t } = useI18n()
	const label = link.plain ? link.label : t(link.label)
	if ('href' in link) return <a href={link.href}>{label}</a>
	return <Link to={link.to}>{label}</Link>
}

/**
 * The site's footer, the same on every page and on the landing (HeroMarkup): the dirt band, then the brand, the disclaimer and the groups
 * of links of content/navigation.ts, edge to edge on the bar's gutter. The landing's site.js finds the band as `.site > .mc-band` to lift
 * the 3D panel when the footer arrives, so the band and the footer stay two siblings of the page's wrapper.
 */
export function SiteFooter() {
	const { session } = useAppContext()
	const { t } = useI18n()
	return (
		<>
			<div className="mm-footer-band mc-band mc-bg-dirt" aria-hidden="true" />
			<footer className="mm-footer">
				<div className="mm-footer-brand">
					<Brand />
					<p className="mm-fineprint">
						{t(
							'Minemories is not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.'
						)}
					</p>
				</div>
				{footerGroups.map(group => (
					<nav key={group.label} aria-label={t(group.label)}>
						<h2 className="mm-footer-title">{t(group.label)}</h2>
						{group.links.map(link => (
							<FooterAnchor key={link.label} link={link} />
						))}
					</nav>
				))}
				<nav aria-label={t('Elsewhere')}>
					<h2 className="mm-footer-title">{t('Elsewhere')}</h2>
					{elsewhereLinks().map(link => (
						<FooterAnchor key={link.label} link={link} />
					))}
					{session && <DiagnosticsAccessLink key={session.user.id} />}
				</nav>
			</footer>
		</>
	)
}
