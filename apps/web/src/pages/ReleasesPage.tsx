import { useEffect } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { LoadingSkeleton } from '../components/Loading'
import { buttonOutline } from '../components/ui'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'
import { ContentLayout } from './ContentPages'
import { releasesUrl } from './mod-releases'
import { ReleaseCard } from './ReleaseCard'
import { useModReleases } from './useModReleases'
import './releases.css'

export function ReleasesPage({ changelog = false }: { changelog?: boolean }) {
	const { releases, status, hasMore, retry, loadMore } = useModReleases()
	const { copy } = useLocalizedCopy()
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
			title={copy(changelog ? 'Les nouveautés' : 'Versions du mod', changelog ? 'What’s new' : 'Mod versions')}
			lead={copy(
				'Le bon fichier pour ton profil Minecraft, et ce qui change à chaque version. Téléchargements directs depuis GitHub.',
				'The right file for your Minecraft profile, and what changes in each release. Direct downloads from GitHub.'
			)}
		>
			<nav className="mm-release-tabs" aria-label={copy('Téléchargements et nouveautés', 'Downloads and updates')}>
				<NavLink to="/versions">{copy('Versions du mod', 'Mod versions')}</NavLink>
				<NavLink to="/changelog">{copy('Nouveautés', 'What’s new')}</NavLink>
				<Link to="/installation">{copy('Guide d’installation ↗', 'Installation guide ↗')}</Link>
			</nav>
			<aside className="mm-release-guide">
				<h2>{copy('Ton premier souvenir commence ici.', 'Your first memory starts here.')}</h2>
				<p>
					{copy(
						'Choisis la dernière version pour Minecraft Java 1.21.1 avec NeoForge 21.1.248. Ferme le jeu, puis garde un seul JAR Minemories dans le dossier mods de ce profil.',
						'Choose the latest version for Minecraft Java 1.21.1 with NeoForge 21.1.248. Close the game, then keep just one Minemories JAR in that profile’s mods folder.'
					)}
				</p>
				<p className="mm-release-muted">
					{copy(
						'Les préversions automatiques passent les contrôles CI ; cela ne garantit pas un essai en jeu de chaque JAR publié. Consulte les notes et garde une sauvegarde de ton monde.',
						'Automatic prereleases pass CI checks; this does not guarantee an in-game test of every published JAR. Read the notes and keep a backup of your world.'
					)}
				</p>
			</aside>
			<div className="mm-release-list" aria-busy={status === 'loading'}>
				{releases.map((release, index) => (
					<ReleaseCard key={release.version} release={release} recommended={index === 0} changelog={changelog} />
				))}
			</div>
			{status === 'loading' && <LoadingSkeleton label={copy('Chargement des versions…', 'Loading releases…')} />}
			{status === 'error' && (
				<div className="mm-release-feedback" role="alert">
					<p>
						{copy(
							'GitHub ne répond pas ou limite temporairement les requêtes. Les versions déjà affichées restent téléchargeables.',
							'GitHub is unavailable or temporarily rate-limiting requests. Releases already shown remain available to download.'
						)}
					</p>
					<button type="button" className={buttonOutline} onClick={retry}>
						{copy('Réessayer', 'Retry')}
					</button>
				</div>
			)}
			{status === 'ready' && releases.length === 0 && (
				<p role="status">
					{copy(
						'Aucune version compatible dans cette partie de l’historique.',
						'No compatible releases in this part of the history.'
					)}
				</p>
			)}
			{status === 'ready' && hasMore && (
				<button className={buttonOutline} type="button" onClick={loadMore}>
					{copy('Charger les versions précédentes', 'Load older releases')}
				</button>
			)}
			<p className="mm-release-source">
				<a href={releasesUrl}>{copy('Toutes les releases sur GitHub ↗', 'All releases on GitHub ↗')}</a>
			</p>
			<noscript>
				<p>
					{copy(
						'Active JavaScript pour consulter l’historique ici, ou utilise directement les releases GitHub ci-dessus.',
						'Enable JavaScript to view the history here, or open GitHub releases directly above.'
					)}
				</p>
			</noscript>
		</ContentLayout>
	)
}
