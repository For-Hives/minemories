import { useState } from 'react'
import { T, useI18n } from '../i18n/I18n'

const screenshots = {
	minecraftVersion: {
		file: '01-minecraft-1.21.1',
		title: 'Choose Minecraft 1.21.1',
		caption: 'Minecraft Launcher → Installations → New installation: select release 1.21.1.',
	},
	java21: {
		file: '02-java-21',
		title: 'Install Java 21 on Windows',
		caption: 'Temurin: choose Windows, Java 21 and your PC architecture, then finish installation.',
	},
	neoforge: {
		file: '03-neoforge-install-client',
		title: 'Install NeoForge on the client',
		caption: 'In the NeoForge 21.1.248 installer, select Install client, then confirm.',
	},
	gameDirectory: {
		file: '04-profil-dossier-jeu',
		title: 'Choose the NeoForge profile folder',
		caption: 'Edit the profile: check 21.1.248 and select the .minecraft-minemories folder under Game Directory.',
	},
	jarDownload: {
		file: '05-jar-telecharge',
		title: 'Find the downloaded JAR',
		caption: 'In Downloads, find minemories-neoforge-mc1.21.1.jar. Copy this file; do not open it.',
	},
	modsFolder: {
		file: '06-dossier-mods',
		title: 'Place the JAR in mods',
		caption:
			"In Windows File Explorer, the correct profile's mods folder contains only one version of the Minemories JAR.",
	},
	modsList: {
		file: '07-liste-mods',
		title: 'Check that Minecraft recognizes Minemories',
		caption: "In the game's Mods menu, Minemories appears in the list.",
	},
	minemoriesMenu: {
		file: '08-menu-minemories',
		title: 'Open the menu with M',
		caption: 'In a test world, the M key opens the Minemories menu.',
	},
	localCapture: {
		file: '09-premiere-capture',
		title: 'Create a small local capture',
		caption: 'In chat, /minemories export 16 ends with an export confirmation message.',
	},
	viewer: {
		file: '10-souvenir-dans-viewer',
		title: 'Revisit the first memory in 3D',
		caption: 'After uploading from the mod, open the capture in your private gallery to revisit it in 3D.',
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
						<T message={'Screenshot coming soon'} />
					</span>
				</div>
			)}
			<figcaption>
				<span>
					<T message={'Visual reference · Windows'} />
				</span>
				{t(screenshot.caption)}
				{src && !failed && (
					<small>
						<T message={'Click the image to enlarge it.'} />
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
