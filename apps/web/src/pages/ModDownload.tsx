import { useEffect, useState } from 'react'

interface Download {
	version: string
	sha256: string
	bytes: number
}
const jarPath = '/downloads/minemories-neoforge-mc1.21.1.jar'

const checksumPattern = /^[a-f0-9]{64}$/
const versionPattern = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/
const jarTypes = [
	'application/java-archive',
	'application/x-java-archive',
	'application/octet-stream',
	'application/zip',
]
function parseManifest(data: unknown): Download | null {
	if (typeof data !== 'object' || data === null) return null
	const value = data as Record<string, unknown>
	if (
		value.file !== jarPath ||
		value.minecraft !== '1.21.1' ||
		value.loader !== 'NeoForge' ||
		value.loaderVersion !== '21.1.248' ||
		typeof value.version !== 'string' ||
		!versionPattern.test(value.version) ||
		!Number.isSafeInteger(value.bytes) ||
		Number(value.bytes) < 4 ||
		typeof value.sha256 !== 'string' ||
		!checksumPattern.test(value.sha256)
	)
		return null
	return { version: value.version, sha256: value.sha256, bytes: Number(value.bytes) }
}

async function fetchDownload(signal: AbortSignal): Promise<Download | null> {
	try {
		const response = await fetch('/downloads/manifest.json', { signal, cache: 'no-store' })
		if (!response.ok) return null
		const download = parseManifest(await response.json())
		if (!download) return null
		const jar = await fetch(`${jarPath}?sha256=${download.sha256}`, { method: 'HEAD', signal, cache: 'no-store' })
		const type = jar.headers.get('content-type')?.split(';')[0]?.trim()
		const length = jar.headers.get('content-length')
		if (!(jar.ok && type && jarTypes.includes(type)) || (length !== null && Number(length) !== download.bytes))
			return null
		return download
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
	if (!download)
		return (
			<div className="install-note">
				<p role="status">
					Le téléchargement est momentanément indisponible. Réessaie ; si le problème persiste, demande le JAR au
					responsable du projet avant de poursuivre.
				</p>
				<button type="button" className="install-secondary" onClick={() => setAttempt(value => value + 1)}>
					Réessayer le téléchargement
				</button>
			</div>
		)
	return (
		<div className="install-download">
			<p>
				<a className="install-primary" href={`${jarPath}?sha256=${download.sha256}`} download>
					Télécharger Minemories {download.version} (.jar)
				</a>
			</p>
			<p>Minecraft Java 1.21.1 · NeoForge 21.1.248 · Version expérimentale.</p>
			<p className="install-caption">
				{(download.bytes / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Mo · Fichier inclus dans
				cette version du site.
			</p>
			<p>
				Place ce fichier directement dans le dossier <code>mods</code> du profil. Ne le décompresse pas et ne le lance
				pas par double-clic.
			</p>
			<details>
				<summary>Vérifier le fichier téléchargé (avancé)</summary>
				<p>
					Empreinte SHA-256 : <code>{download.sha256}</code>
				</p>
				<a href={`${jarPath}.sha256?sha256=${download.sha256}`}>Télécharger l’empreinte</a>
			</details>
		</div>
	)
}
