/**
 * The viewer's two lighting styles. `realistic` is the HDR studio render (sun, shadows, sky reflections, ACES);
 * `faithful` reproduces how Minecraft itself lights a block: a fixed shade per face direction multiplied by the
 * sky light of the hour from the game's light map, with block light from emissive blocks and captured lights on top.
 */
export type ViewerLighting = 'realistic' | 'faithful'

export const viewerLightings: readonly ViewerLighting[] = ['realistic', 'faithful']

/** Brightness of a face whose normal points up, down, north/south (z) and east/west (x), as the game shades blocks. */
export const FACE_SHADE = { up: 1, down: 0.5, northSouth: 0.8, eastWest: 0.6 } as const

/** Rain, snow and overcast skies darken the sky by 5/16, as rain does in game. */
export const STORM_DARKENING = 5 / 16

/** The game's default brightness option (50 %), between Moody and Bright. */
export const GAME_BRIGHTNESS = 0.5

export type Rgb = [red: number, green: number, blue: number]

/**
 * Minecraft's directional shade for a unit normal, in sRGB (multiply the displayed colour by it).
 * Axis-aligned faces get the game's exact values; slanted faces blend them by the squared components,
 * the formula the game uses for item and entity models.
 */
export function faceShade(x: number, y: number, z: number): number {
	const vertical = y > 0 ? FACE_SHADE.up : FACE_SHADE.down
	return x * x * FACE_SHADE.eastWest + y * y * vertical + z * z * FACE_SHADE.northSouth
}

/** The brightness option lifts dark values towards 1 - (1 - x)^4. */
function brighten(value: number): number {
	return value + (1 - (1 - value) ** 4 - value) * GAME_BRIGHTNESS
}

/**
 * Full sky light (level 15) for the viewer's daylight (0 at night, 1 at noon) as the game's light map computes it,
 * in sRGB: white by day, a dim moonlit blue at night (about 0.27, 0.27, 0.46), never black.
 */
export function faithfulSkyLight(daylight: number, stormy = false): Rgb {
	const sun = Math.min(Math.max(daylight, 0), 1) * (stormy ? 1 - STORM_DARKENING : 1)
	const darken = 0.2 + 0.8 * sun
	const level = darken * 0.95 + 0.05
	const tint: Rgb = [darken, darken, 1]
	return tint.map(channel => brighten((channel + (1 - channel) * 0.35) * level) * 0.96 + 0.03) as Rgb
}

/** The renderer works in linear light; the game multiplies displayed (sRGB) colours. */
export function srgbFactorToLinear(factor: number): number {
	return factor ** 2.2
}

export function isViewerLighting(value: unknown): value is ViewerLighting {
	return value === 'realistic' || value === 'faithful'
}

const lightingKey = 'minemories-viewer-lighting'

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

/** The lighting style this viewer chose last time on this device; realistic by default. */
export function readViewerLighting(storage: Storage | undefined): ViewerLighting {
	try {
		const stored = storage?.getItem(lightingKey)
		return isViewerLighting(stored) ? stored : 'realistic'
	} catch {
		return 'realistic'
	}
}

export function storeViewerLighting(storage: Storage | undefined, lighting: ViewerLighting): void {
	try {
		storage?.setItem(lightingKey, lighting)
	} catch {
		// Private mode or blocked storage: the choice still applies to this page.
	}
}

/** `window.localStorage` itself throws when site data is blocked. */
export function browserStorage(): Storage | undefined {
	try {
		return globalThis.localStorage ?? undefined
	} catch {
		return undefined
	}
}
