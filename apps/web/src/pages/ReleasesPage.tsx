import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { LoadingSkeleton } from '../components/Loading'
import { buttonOutline } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { ContentLayout } from './ContentPages'
import { indexUrl } from './mod-releases'
import { ReleaseCard } from './ReleaseCard'
import { useModReleases } from './useModReleases'
import './releases.css'

export function ReleasesPage() {
	const { releases, status, retry } = useModReleases()
	const { t } = useI18n()
	const { hash } = useLocation()
	// The release named in the URL is opened and scrolled to once: loading older pages must not jump back to it.
	const shownHash = useRef('')
	useEffect(() => {
		if (!hash || hash === shownHash.current) return
		const target = document.getElementById(hash.slice(1))
		if (!target) return
		shownHash.current = hash
		target.querySelector('details.mm-release-notes')?.setAttribute('open', '')
		target.scrollIntoView?.({ block: 'start' })
	}, [hash, releases])
	return (
		<ContentLayout
			eyebrow={t('MINEMORIES · RELEASES')}
			title={t('What changes in Minemories')}
			lead={t(
				'The right file for your Minecraft profile, with its size and checksum. Direct downloads from Minemories.'
			)}
		>
			<nav className="mm-release-tabs" aria-label={t('Downloads and updates')}>
				<Link to="/installation">{t('Installation guide ↗')}</Link>
			</nav>
			<aside className="mm-release-guide">
				<h2>{t('Your first memory starts here.')}</h2>
				<p>
					{t(
						'Choose the latest version, then the JAR matching your Minecraft version and your loader: NeoForge, Fabric (also used under Quilt) or Forge. Close the game, then keep just one Minemories JAR in that profile’s mods folder.'
					)}
				</p>
				<p className="mm-release-muted">
					{t(
						'Prereleases are built automatically; this does not guarantee an in-game test of every published JAR. Keep a backup of your world.'
					)}
				</p>
			</aside>
			<div className="mm-release-list" aria-busy={status === 'loading'}>
				{releases.map((release, index) => (
					<ReleaseCard key={release.version} release={release} recommended={index === 0} />
				))}
			</div>
			{status === 'loading' && <LoadingSkeleton label={t('Loading releases…')} />}
			{status === 'error' && (
				<div className="mm-release-feedback" role="alert">
					<p>{t('The list of versions could not be loaded. Try again in a moment.')}</p>
					<button type="button" className={buttonOutline} onClick={retry}>
						{t('Retry')}
					</button>
				</div>
			)}
			{status === 'ready' && releases.length === 0 && <p role="status">{t('No version is published yet.')}</p>}
			<noscript>
				<p>
					{t('Enable JavaScript to see the available versions here.')} <a href={indexUrl}>index.json</a>
				</p>
			</noscript>
		</ContentLayout>
	)
}
