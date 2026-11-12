import { T, useI18n } from '../i18n/I18n'

/**
 * Real in-game screenshots of the guide, taken by the Fabric 1.21.11 client game test
 * (mod/1.21.11/fabric/src/gametest/.../GuideScreenshotsGameTest.java). Refresh them whenever the mod's
 * button, menu or command changes: see src/assets/tutorial/game/README.md. The pause-menu and command shots are no
 * longer shown: the Minemories button left the pause menu for Options, and the guide no longer teaches the command.
 */
interface Shot {
	file: string
	size: [number, number]
	/** The control to click, outlined over the image (the screenshot itself stays untouched). */
	mark?: [number, number, number, number]
	alt: string
	caption: string
}
const shots: Record<'minemoriesMenu', Shot> = {
	minemoriesMenu: {
		file: 'guide-minemories-menu',
		size: [1280, 720],
		mark: [368, 404, 176, 116],
		alt: 'The Minemories menu with the Take a memory button',
		caption: 'The Minemories menu (M key): “Take a memory” keeps a 3D copy of what’s around you.',
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
