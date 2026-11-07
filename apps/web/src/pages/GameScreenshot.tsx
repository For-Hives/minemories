import { T, useI18n } from '../i18n/I18n'

/**
 * Real in-game screenshots of the guide, taken by the Fabric 1.21.11 client game test
 * (mod/1.21.11/fabric/src/gametest/.../GuideScreenshotsGameTest.java). Refresh them whenever the mod's
 * button, menu or command changes: see src/assets/tutorial/game/README.md.
 */
interface Shot {
	file: string
	size: [number, number]
	/** The control to click, outlined over the image (the screenshot itself stays untouched). */
	mark?: [number, number, number, number]
	alt: string
	caption: string
}
const shots: Record<'pauseMenu' | 'minemoriesMenu' | 'exportCommand', Shot> = {
	pauseMenu: {
		file: 'guide-pause-menu',
		size: [1280, 720],
		// The Minemories button, in pixels of the image: x, y, width, height.
		mark: [1056, 16, 208, 40],
		alt: 'Minecraft pause menu with the Minemories button in its top-right corner',
		caption: 'Press Esc in game: the Minemories button is in the top-right corner of the pause menu.',
	},
	minemoriesMenu: {
		file: 'guide-minemories-menu',
		size: [1280, 720],
		mark: [368, 404, 176, 116],
		alt: 'The Minemories menu with the Take a memory button',
		caption: 'The Minemories menu (M key): “Take a memory” captures what is around you.',
	},
	exportCommand: {
		file: 'guide-export-command',
		// Cropped to the chat line: the command is unreadable on a full 1280 x 720 frame.
		size: [460, 58],
		alt: 'Minecraft chat with the command /minemories export 16 typed in',
		caption: 'The same capture with a command: open chat with T, type it, then press Enter.',
	},
}
export type GameScreenshotId = keyof typeof shots

const images = import.meta.glob<string>('../assets/tutorial/game/*.{png,webp}', {
	eager: true,
	query: '?url',
	import: 'default',
})

function imageFor(file: string): string | undefined {
	return images[`../assets/tutorial/game/${file}.webp`] ?? images[`../assets/tutorial/game/${file}.png`]
}

/** One game screenshot with its caption; nothing is shown while the image has not been generated. */
export function GameScreenshot({ id }: { id: GameScreenshotId }) {
	const { t } = useI18n()
	const shot = shots[id]
	const src = imageFor(shot.file)
	if (!src) return null
	return (
		<figure className="install-screenshot install-game-shot">
			<a href={src} target="_blank" rel="noreferrer" aria-label={t('Enlarge: {title}', { title: t(shot.alt) })}>
				{/* biome-ignore lint/performance/noImgElement: static Vite asset; lazy loading avoids downloading off-screen screenshots. */}
				<img src={src} alt={t(shot.alt)} width={shot.size[0]} height={shot.size[1]} loading="lazy" decoding="async" />
				{shot.mark && (
					<span
						className="install-game-mark"
						aria-hidden="true"
						style={{
							left: `${(shot.mark[0] / shot.size[0]) * 100}%`,
							top: `${(shot.mark[1] / shot.size[1]) * 100}%`,
							width: `${(shot.mark[2] / shot.size[0]) * 100}%`,
							height: `${(shot.mark[3] / shot.size[1]) * 100}%`,
						}}
					/>
				)}
			</a>
			<figcaption>
				<T message={shot.caption} />
			</figcaption>
		</figure>
	)
}
