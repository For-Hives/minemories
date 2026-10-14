import { useEffect, useState } from 'react'

const repository = 'For-Hives/minemories'
const releasesUrl = `https://github.com/${repository}/releases`
const apiUrl = `https://api.github.com/repos/${repository}/releases?per_page=30`
const jarName = 'minemories-neoforge-mc1.21.1.jar'
const versionPattern = /^mod-v(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)$/
const digestPattern = /^sha256:([a-f0-9]{64})$/
interface Download {
	version: string
	url: string
	bytes: number
	sha256: string | null
	checksumUrl: string | null
	prerelease: boolean
	published: number
}

function parseRelease(value: unknown): Download | null {
	if (typeof value !== 'object' || value === null) return null
	const release = value as Record<string, unknown>
	if (
		release.draft !== false ||
		typeof release.tag_name !== 'string' ||
		typeof release.published_at !== 'string' ||
		!Array.isArray(release.assets)
	)
		return null
	const version = versionPattern.exec(release.tag_name)?.[1]
	const published = Date.parse(release.published_at)
	if (!(version && Number.isFinite(published))) return null
	const prefix = `${releasesUrl}/download/${encodeURIComponent(release.tag_name)}/`
	const asset = release.assets.find(
		item => item?.name === jarName && item.browser_download_url === `${prefix}${jarName}`
	)
	if (!(asset && Number.isSafeInteger(asset.size)) || asset.size < 4) return null
	const checksum = release.assets.find(
		item => item?.name === `${jarName}.sha256` && item.browser_download_url === `${prefix}${jarName}.sha256`
	)
	return {
		version,
		url: asset.browser_download_url,
		bytes: asset.size,
		sha256: typeof asset.digest === 'string' ? (digestPattern.exec(asset.digest)?.[1] ?? null) : null,
		checksumUrl: checksum?.browser_download_url ?? null,
		prerelease: release.prerelease === true,
		published,
	}
}
export function selectLatestRelease(data: unknown): Download | null {
	if (!Array.isArray(data)) return null
	return (
		data
			.map(parseRelease)
			.filter((release): release is Download => release !== null)
			.sort((a, b) => b.published - a.published)[0] ?? null
	)
}
async function fetchDownload(signal: AbortSignal) {
	try {
		const response = await fetch(apiUrl, { signal, headers: { Accept: 'application/vnd.github+json' } })
		if (!response.ok) return null
		return selectLatestRelease(await response.json())
	} catch {
		return null
	}
}
export function ModDownload() {
	const [download, setDownload] = useState<Download | null>(null)
	const [pending, setPending] = useState(true)
	const [attempt, setAttempt] = useState(0)
	useEffect(() => {
		const controller = new AbortController()
		setPending(true)
		const timeout = window.setTimeout(() => {
			controller.abort()
			setDownload(null)
			setPending(false)
		}, 15000)
		void fetchDownload(controller.signal).then(result => {
			if (controller.signal.aborted) return
			window.clearTimeout(timeout)
			setDownload(result)
			setPending(false)
		})
		return () => {
			controller.abort()
			window.clearTimeout(timeout)
		}
	}, [attempt])
	if (pending) return <p role="status">Vérification du téléchargement…</p>
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
					<button type="button" className="install-secondary" onClick={() => setAttempt(value => value + 1)}>
						Réessayer le téléchargement
					</button>
				</>
			)}
			<p>
				<a href={releasesUrl}>Toutes les versions sur GitHub</a>
			</p>
		</div>
	)
}
