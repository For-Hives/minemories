import { Link } from 'react-router'
import { T, useI18n } from '../i18n/I18n'
import { releasesUrl } from './mod-releases'
import { useModReleases } from './useModReleases'

export { selectLatestRelease } from './mod-releases'

export function ModDownload() {
	const { t, locale } = useI18n()

	const { releases, status, retry } = useModReleases()
	const download = releases[0]
	if (status === 'loading')
		return (
			<p role="status">
				<T message={'Vérification du téléchargement…'} />
			</p>
		)
	return (
		<div className="install-download">
			{download ? (
				<>
					<p>
						<a className="install-primary" href={download.url}>
							<T message={'Télécharger Minemories'} /> {download.version} (.jar)
						</a>
					</p>
					<p>
						Minecraft Java 1.21.1 · NeoForge 21.1.248 ·{' '}
						{download.prerelease ? t('Préversion expérimentale.') : t('Version publiée.')}
					</p>
					<p className="install-caption">
						{(download.bytes / 1048576).toLocaleString(locale, { maximumFractionDigits: 2 })}{' '}
						<T message={'MiB · Téléchargement depuis GitHub Releases.'} />
					</p>
					<p>
						<T message={'Place ce fichier directement dans le dossier'} /> <code>mods</code>{' '}
						<T message={'du profil. Ne le décompresse pas et ne le lance pas par double-clic.'} />
					</p>
					{(download.sha256 || download.checksumUrl) && (
						<details>
							<summary>
								<T message={'Vérifier le fichier téléchargé (avancé)'} />
							</summary>
							{download.sha256 && (
								<p>
									<T message={'Empreinte SHA-256 :'} /> <code>{download.sha256}</code>
								</p>
							)}
							{download.checksumUrl && (
								<a href={download.checksumUrl}>
									<T message={'Télécharger l’empreinte'} />
								</a>
							)}
						</details>
					)}
				</>
			) : (
				<>
					<p role="status">
						<T
							message={
								'Aucune release compatible n’est disponible pour le moment, ou GitHub ne répond pas. Consulte les versions du projet ou réessaie dans un instant.'
							}
						/>
					</p>
					<button type="button" className="install-secondary" onClick={retry}>
						<T message={'Réessayer le téléchargement'} />
					</button>
				</>
			)}
			<p>
				<Link to="/versions">
					<T message={'Versions précédentes et nouveautés'} />
				</Link>
			</p>
			<p>
				<a href={releasesUrl}>
					<T message={'Toutes les versions sur GitHub'} />
				</a>
			</p>
		</div>
	)
}
