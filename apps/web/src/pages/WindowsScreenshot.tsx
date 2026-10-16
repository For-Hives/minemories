import { useState } from 'react'
import { T, useI18n } from '../i18n/I18n'

const screenshots = {
	minecraftVersion: {
		file: '01-minecraft-1.21.1',
		title: 'Choisir Minecraft 1.21.1',
		caption: 'Minecraft Launcher → Installations → Nouvelle installation : sélectionner release 1.21.1.',
	},
	java21: {
		file: '02-java-21',
		title: 'Installer Java 21 sur Windows',
		caption: 'Temurin : choisir Windows, Java 21 et l’architecture du PC, puis terminer l’installation.',
	},
	neoforge: {
		file: '03-neoforge-install-client',
		title: 'Installer NeoForge côté joueur',
		caption: 'Dans l’installateur NeoForge 21.1.248, cocher Install client, puis valider.',
	},
	gameDirectory: {
		file: '04-profil-dossier-jeu',
		title: 'Choisir le dossier du profil NeoForge',
		caption:
			'Modifier le profil : vérifier 21.1.248 et sélectionner le dossier .minecraft-minemories dans Dossier du jeu.',
	},
	jarDownload: {
		file: '05-jar-telecharge',
		title: 'Retrouver le JAR téléchargé',
		caption:
			'Dans Téléchargements, retrouver minemories-neoforge-mc1.21.1.jar. Ce fichier se copie ; il ne s’ouvre pas.',
	},
	modsFolder: {
		file: '06-dossier-mods',
		title: 'Déposer le JAR dans mods',
		caption: 'Dans l’Explorateur Windows, le dossier mods du bon profil contient une seule version du JAR Minemories.',
	},
	modsList: {
		file: '07-liste-mods',
		title: 'Vérifier que Minecraft reconnaît Minemories',
		caption: 'Dans le menu Mods du jeu, Minemories apparaît dans la liste.',
	},
	minemoriesMenu: {
		file: '08-menu-minemories',
		title: 'Ouvrir le menu avec M',
		caption: 'Dans un monde de test, la touche M ouvre le menu Minemories.',
	},
	localCapture: {
		file: '09-premiere-capture',
		title: 'Créer une petite capture locale',
		caption: 'Dans le chat, /minemories export 16 se termine par un message confirmant l’export.',
	},
	viewer: {
		file: '10-souvenir-dans-viewer',
		title: 'Revoir le premier souvenir en 3D',
		caption: 'Après envoi depuis le mod, ouvre la capture de ta galerie privée pour la revoir en 3D.',
	},
}

export type WindowsScreenshotId = keyof typeof screenshots
const images = import.meta.glob<string>('../assets/tutorial/windows/*.{png,jpg,webp}', {
	eager: true,
	query: '?url',
	import: 'default',
})

export function ScreenshotFrame({ id, src }: { id: WindowsScreenshotId; src?: string | undefined }) {
	const { t } = useI18n()
	const [failed, setFailed] = useState(false)
	const screenshot = screenshots[id]
	return (
		<figure className="install-screenshot" data-screenshot={screenshot.file}>
			{src && !failed ? (
				<a
					href={src}
					target="_blank"
					rel="noreferrer"
					aria-label={t('Enlarge: {title}', { title: t(screenshot.title) })}
				>
					{/* biome-ignore lint/performance/noImgElement: static Vite tutorial asset; lazy loading avoids downloading off-screen screenshots. */}
					<img
						src={src}
						width={1600}
						height={900}
						alt={t(screenshot.caption)}
						loading="lazy"
						onError={() => setFailed(true)}
					/>
				</a>
			) : (
				<div className="install-screenshot-placeholder">
					<svg width="44" height="36" viewBox="0 0 44 36" fill="none" aria-hidden="true">
						<rect x="1" y="1" width="42" height="34" rx="5" stroke="currentColor" />
						<circle cx="31" cy="10" r="3" stroke="currentColor" />
						<path d="m5 29 11-13 10 11 5-6 8 8" stroke="currentColor" />
					</svg>
					<strong>{t(screenshot.title)}</strong>
					<span>
						<T message={'Capture d’écran à venir'} />
					</span>
				</div>
			)}
			<figcaption>
				<span>
					<T message={'Repère visuel · Windows'} />
				</span>
				{t(screenshot.caption)}
				{src && !failed && (
					<small>
						<T message={'Clique sur l’image pour l’agrandir.'} />
					</small>
				)}
			</figcaption>
		</figure>
	)
}

export function WindowsScreenshot({ id }: { id: WindowsScreenshotId }) {
	const file = screenshots[id].file
	const src = ['webp', 'png', 'jpg']
		.map(extension => images[`../assets/tutorial/windows/${file}.${extension}`])
		.find(Boolean)
	return <ScreenshotFrame key={src} id={id} src={src} />
}
