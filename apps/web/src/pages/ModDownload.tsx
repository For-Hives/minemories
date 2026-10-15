import { Link } from 'react-router'
import { releasesUrl } from './mod-releases'
import { useModReleases } from './useModReleases'

export { selectLatestRelease } from './mod-releases'

export function ModDownload() {
	const { releases, status, retry } = useModReleases()
	const download = releases[0]
	if (status === 'loading') return <p role="status">Vérification du téléchargement…</p>
	return (
		<div className="install-download">
			{download ? (
				<>
					<p>
						<a className="install-primary" href={download.url}>
							Télécharger Minemories {download.version} (.jar)
						</a>
					</p>
					<p>
						Minecraft Java 1.21.1 · NeoForge 21.1.248 ·{' '}
						{download.prerelease ? 'Préversion expérimentale.' : 'Version publiée.'}
					</p>
					<p className="install-caption">
						{(download.bytes / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Mo · Téléchargement
						depuis GitHub Releases.
					</p>
					<p>
						Place ce fichier directement dans le dossier <code>mods</code> du profil. Ne le décompresse pas et ne le
						lance pas par double-clic.
					</p>
					{(download.sha256 || download.checksumUrl) && (
						<details>
							<summary>Vérifier le fichier téléchargé (avancé)</summary>
							{download.sha256 && (
								<p>
									Empreinte SHA-256 : <code>{download.sha256}</code>
								</p>
							)}
							{download.checksumUrl && <a href={download.checksumUrl}>Télécharger l’empreinte</a>}
						</details>
					)}
				</>
			) : (
				<>
					<p role="status">
						Aucune release compatible n’est disponible pour le moment, ou GitHub ne répond pas. Consulte les versions du
						projet ou réessaie dans un instant.
					</p>
					<button type="button" className="install-secondary" onClick={retry}>
						Réessayer le téléchargement
					</button>
				</>
			)}
			<p>
				<Link to="/versions">Versions précédentes et nouveautés</Link>
			</p>
			<p>
				<a href={releasesUrl}>Toutes les versions sur GitHub</a>
			</p>
		</div>
	)
}
