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

/** The light map's last steps: the brightness option, then a 4 % pull towards 0.75. */
function finishLightMap(value: number): number {
	return brighten(Math.min(Math.max(value, 0), 1)) * 0.96 + 0.03
}

/**
 * Which sky lights a capture in the game's light map. `overworld` follows the hour; the Nether has no sky light
 * and a constant ambient light of 0.1; the End forces its fixed bright light map; `underground` (the deep dark)
 * gets no sky light at all, only block light over the light map's minimum.
 */
export type FaithfulSky = 'overworld' | 'nether' | 'end' | 'underground'

/** The Nether dimension's ambient light, which lifts every light level, and the game's average torch flicker. */
const NETHER_AMBIENT = 0.1
const BLOCK_FLICKER = 1.5
/** The End's forced light map pulls every cell 25 % towards this colour. */
const END_LIGHT_MAP: Rgb = [0.99, 1.12, 1]

/**
 * Sky light (or the dimension's ambient light where there is no sky) of a block-light-0 face, in sRGB, as the game's
 * light map computes it. Overworld: full sky light (level 15) for the viewer's daylight (0 at night, 1 at noon),
 * white by day, a dim moonlit blue at night (about 0.27, 0.27, 0.46), never black. Nether: a constant warm
 * (0.35, 0.27, 0.22) from the dimension's ambient light. End: the forced, slightly green (0.47, 0.52, 0.48).
 * Underground: the light map's minimum, 0.03. Writes into `out` so the frame loop allocates nothing.
 */
export function faithfulSkyLight(
	daylight: number,
	stormy = false,
	sky: FaithfulSky = 'overworld',
	out: Rgb = [0, 0, 0]
): Rgb {
	if (sky === 'end') {
		out[0] = finishLightMap(END_LIGHT_MAP[0] * 0.25)
		out[1] = finishLightMap(END_LIGHT_MAP[1] * 0.25)
		out[2] = finishLightMap(END_LIGHT_MAP[2] * 0.25)
		return out
	}
	if (sky === 'underground') {
		out[0] = finishLightMap(0)
		out[1] = out[0]
		out[2] = out[0]
		return out
	}
	// The Nether's fixed time is midnight, and its sky level 0 still gets the ambient light.
	const nether = sky === 'nether'
	const sun = nether ? 0 : Math.min(Math.max(daylight, 0), 1) * (stormy ? 1 - STORM_DARKENING : 1)
	const darken = 0.2 + 0.8 * sun
	const level = (darken * 0.95 + 0.05) * (nether ? NETHER_AMBIENT : 1)
	const grey = (darken + (1 - darken) * 0.35) * level
	const blue = level
	// Block light 0 only glows where the ambient light lifts it, with the game's warm block-light tint.
	const block = nether ? NETHER_AMBIENT * BLOCK_FLICKER : 0
	out[0] = finishLightMap(grey + block)
	out[1] = finishLightMap(grey + block * ((block * 0.6 + 0.4) * 0.6 + 0.4))
	out[2] = finishLightMap(blue + block * (block * block * 0.6 + 0.4))
	return out
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
