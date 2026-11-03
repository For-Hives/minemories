import { useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { LoadingSkeleton } from '../components/Loading'
import { buttonOutline } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { ContentLayout } from './ContentPages'
import { releasesUrl } from './mod-releases'
import { ReleaseCard } from './ReleaseCard'
import { useModReleases } from './useModReleases'
import './releases.css'

export function ReleasesPage({ changelog = false }: { changelog?: boolean }) {
	const { releases, status, hasMore, retry, loadMore } = useModReleases()
	const { t } = useI18n()
	const { hash } = useLocation()
	useEffect(() => {
		if (!(hash && releases.length)) return
		const target = document.getElementById(hash.slice(1))
		const notes = target?.querySelector('details.mm-release-notes')
		notes?.setAttribute('open', '')
		target?.scrollIntoView?.({ block: 'start' })
	}, [hash, releases])
	return (
		<ContentLayout
			eyebrow="MINEMORIES · RELEASES"
			title={t(changelog ? 'releases.changelog.title' : 'Mod versions')}
			lead={t(
				'The right file for your Minecraft profile, and what changes in each release. Direct downloads from GitHub.'
			)}
		>
			<nav className="mm-release-tabs" aria-label={t('Downloads and updates')}>
				<NavLink to="/versions">{t('Mod versions')}</NavLink>
				<NavLink to="/changelog">{t('What’s new')}</NavLink>
				<Link to="/installation">{t('Installation guide ↗')}</Link>
			</nav>
			<aside className="mm-release-guide">
				<h2>{t('Your first memory starts here.')}</h2>
				<p>
					{t(
						'Choose the latest version for Minecraft Java 1.21.1 with NeoForge 21.1.248. Close the game, then keep just one Minemories JAR in that profile’s mods folder.'
					)}
				</p>
				<p className="mm-release-muted">
					{t(
						'Automatic prereleases pass CI checks; this does not guarantee an in-game test of every published JAR. Read the notes and keep a backup of your world.'
					)}
				</p>
			</aside>
			<div className="mm-release-list" aria-busy={status === 'loading'}>
				{releases.map((release, index) => (
					<ReleaseCard key={release.version} release={release} recommended={index === 0} changelog={changelog} />
				))}
			</div>
			{status === 'loading' && <LoadingSkeleton label={t('Loading releases…')} />}
			{status === 'error' && (
				<div className="mm-release-feedback" role="alert">
					<p>
						{t(
							'GitHub is unavailable or temporarily rate-limiting requests. Releases already shown remain available to download.'
						)}
					</p>
					<button type="button" className={buttonOutline} onClick={retry}>
						{t('Retry')}
					</button>
				</div>
			)}
			{status === 'ready' && releases.length === 0 && (
				<p role="status">{t('No compatible releases in this part of the history.')}</p>
			)}
			{status === 'ready' && hasMore && (
				<button className={buttonOutline} type="button" onClick={loadMore}>
					{t('Load older releases')}
				</button>
			)}
			<p className="mm-release-source">
				<a href={releasesUrl}>{t('All releases on GitHub ↗')}</a>
			</p>
			<noscript>
				<p>{t('Enable JavaScript to view the history here, or open GitHub releases directly above.')}</p>
			</noscript>
		</ContentLayout>
	)
}
