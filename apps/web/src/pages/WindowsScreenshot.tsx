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
		file: '04-profile-game-directory',
		title: 'Choose the NeoForge profile folder',
		caption: 'Edit the profile: check 21.1.248 and select the .minecraft-minemories folder under Game Directory.',
	},
	jarDownload: {
		file: '05-downloaded-jar',
		title: 'Find the downloaded JAR',
		caption: 'In Downloads, find minemories-neoforge-mc1.21.1.jar. Copy this file; do not open it.',
	},
	modsFolder: {
		file: '06-mods-folder',
		title: 'Place the JAR in mods',
		caption:
			"In Windows File Explorer, the correct profile's mods folder contains only one version of the Minemories JAR.",
	},
	viewer: {
		file: '10-memory-in-viewer',
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
	// A missing or broken image shows nothing rather than an empty frame promising a screenshot.
	if (!src || failed) return null
	return (
		<figure className="install-screenshot" data-screenshot={screenshot.file}>
			<a href={src} target="_blank" rel="noreferrer" aria-label={t('Enlarge: {title}', { title: t(screenshot.title) })}>
				<img
					src={src}
					width={1600}
					height={900}
					alt={t(screenshot.caption)}
					loading="lazy"
					onError={() => setFailed(true)}
				/>
			</a>
			<figcaption>
				<span>
					<T message={'Visual reference · Windows'} />
				</span>
				{t(screenshot.caption)}
				<small>
					<T message={'Click the image to enlarge it.'} />
				</small>
			</figcaption>
		</figure>
	)
}

function screenshotSource(id: WindowsScreenshotId): string | undefined {
	const file = screenshots[id].file
	return ['webp', 'png', 'jpg']
		.map(extension => images[`../assets/tutorial/windows/${file}.${extension}`])
		.find(Boolean)
}
/** Whether at least one of these screenshots has an image file: the fold that holds them is not shown empty. */
export function hasWindowsScreenshot(ids: WindowsScreenshotId[]): boolean {
	return ids.some(id => screenshotSource(id) !== undefined)
}

export function WindowsScreenshot({ id }: { id: WindowsScreenshotId }) {
	const src = screenshotSource(id)
	return <ScreenshotFrame key={src} id={id} src={src} />
}
