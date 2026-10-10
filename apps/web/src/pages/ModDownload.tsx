import { useEffect, useState } from 'react'

interface Download {
	version: string
	sha256: string
}
const jarPath = '/downloads/minemories-neoforge-mc1.21.1.jar'

const checksumPattern = /^[a-f0-9]{64}$/
function parseManifest(data: unknown): Download | null {
	if (typeof data !== 'object' || data === null) return null
	const value = data as Record<string, unknown>
	if (
		value.file !== jarPath ||
		value.minecraft !== '1.21.1' ||
		value.loaderVersion !== '21.1.248' ||
		typeof value.version !== 'string' ||
		typeof value.sha256 !== 'string' ||
		!checksumPattern.test(value.sha256)
	)
		return null
	return { version: value.version, sha256: value.sha256 }
}

async function fetchDownload(signal: AbortSignal): Promise<Download | null> {
	try {
		const response = await fetch('/downloads/manifest.json', { signal, cache: 'no-store' })
		if (!response.ok) return null
		return parseManifest(await response.json())
	} catch {
		return null
	}
}

export function ModDownload() {
	const [download, setDownload] = useState<Download | null>(null)
	const [pending, setPending] = useState(true)
	useEffect(() => {
		const controller = new AbortController()
		void fetchDownload(controller.signal).then(result => {
			if (controller.signal.aborted) return
			setDownload(result)
			setPending(false)
		})
		return () => controller.abort()
	}, [])
	if (pending) return <p role="status">Vérification du téléchargement…</p>
	if (!download)
		return (
			<p role="status">
				Le JAR n’est pas disponible sur cette installation du site. Consulte les{' '}
				<a href="https://github.com/For-Hives/minemories/releases">versions du projet</a> ou demande le fichier au
				responsable.
			</p>
		)
	return (
		<div>
			<p>
				<a href={`${jarPath}?sha256=${download.sha256}`} download>
					Télécharger Minemories {download.version} (.jar)
				</a>
			</p>
			<p>Minecraft Java 1.21.1 · NeoForge 21.1.248 · Version expérimentale.</p>
			<p>
				Place ce fichier directement dans le dossier <code>mods</code> du profil. Ne le décompresse pas et ne le lance
				pas par double-clic.
			</p>
			<details>
				<summary>Vérifier le fichier téléchargé (avancé)</summary>
				<p>
					Empreinte SHA-256 : <code>{download.sha256}</code>
				</p>
				<a href={`${jarPath}.sha256`}>Télécharger l’empreinte</a>
			</details>
		</div>
	)
}
