import type { DemoTheme } from '../content/discovery'

// Isometric stills of the landing's captures (public/hero/scenes/, docs/features/design-system.md): the same chalet and forest,
// seen from another side for each theme. The stages of a timeline go from the forgotten chalet to the lived-in one.
const themeStill: Record<DemoTheme, string> = { home: 'chalet', village: 'clairiere', garden: 'foret' }
const stageStill = ['chalet-oublie', 'chalet-envahi']

export function MemoryScene({
	theme = 'home',
	stage = 3,
	label,
}: {
	theme?: DemoTheme
	stage?: number
	label: string
}) {
	const still = stageStill[stage - 1] ?? themeStill[theme]
	return (
		<img
			className={`mm-memory-scene mm-scene-${theme}`}
			src={`/hero/scenes/${still}.webp`}
			alt={label}
			width="960"
			height="720"
			loading="lazy"
			decoding="async"
		/>
	)
}
