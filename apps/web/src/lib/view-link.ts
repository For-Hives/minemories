/**
 * A precise view carried by a share link: where the camera stands and looks, the hour, the weather, the lighting,
 * the hidden layers and, for a world link, which snapshot. Coordinates are in the shown capture's own space, so a
 * view taken in a composed timelapse world opens on the same spot when the snapshot is loaded alone.
 *
 * Read from untrusted query parameters: every field is checked and a bad one is simply left out.
 */
export interface ViewLink {
	camera?: Point
	target?: Point
	/** Minutes since midnight, 0 to 1439. */
	minutes?: number
	weather?: ViewWeather
	lighting?: ViewLighting
	hidden?: ViewCategory[]
	snapshot?: string
}

export type Point = readonly [number, number, number]
export const VIEW_WEATHERS = ['clear', 'mist', 'overcast', 'rain', 'snow'] as const
export type ViewWeather = (typeof VIEW_WEATHERS)[number]
export const VIEW_LIGHTINGS = ['realistic', 'faithful'] as const
export type ViewLighting = (typeof VIEW_LIGHTINGS)[number]
export const VIEW_CATEGORIES = ['terrain', 'decor', 'fluids', 'block_entities', 'entities'] as const
export type ViewCategory = (typeof VIEW_CATEGORIES)[number]

/** The query keys a view uses; anything else in the address is left alone. */
export const VIEW_KEYS = ['cam', 'at', 'time', 'weather', 'light', 'hide', 'snap'] as const

/** Far beyond any capture (a world spans 60 million blocks); refuses absurd numbers. */
const LIMIT = 1e8
const SNAPSHOT = /^[A-Za-z0-9_-]{1,128}$/
const CLOCK = /^(\d{1,2}):(\d{2})$/

function round(value: number): string {
	return String(Math.round(value * 100) / 100)
}

function point(raw: string | null): Point | undefined {
	const parts = raw?.split(',') ?? []
	if (parts.length !== 3) return
	const values = parts.map(part => (part.trim() === '' ? Number.NaN : Number(part)))
	if (values.some(value => !Number.isFinite(value) || Math.abs(value) > LIMIT)) return
	return [values[0] as number, values[1] as number, values[2] as number]
}

function clock(raw: string | null): number | undefined {
	const match = CLOCK.exec(raw ?? '')
	if (!match) return
	const hours = Number(match[1])
	const minutes = Number(match[2])
	if (hours > 23 || minutes > 59) return
	return hours * 60 + minutes
}

function oneOf<T extends string>(values: readonly T[], raw: string | null): T | undefined {
	return values.find(value => value === raw)
}

/** Reads a view from a link's query; an absent or invalid field is undefined. */
export function readViewLink(params: URLSearchParams): ViewLink {
	const view: ViewLink = {}
	const camera = point(params.get('cam'))
	const target = point(params.get('at'))
	// A camera alone has nothing to look at, a target alone no place to stand: both or neither.
	if (camera && target) {
		view.camera = camera
		view.target = target
	}
	const minutes = clock(params.get('time'))
	if (minutes !== undefined) view.minutes = minutes
	const weather = oneOf(VIEW_WEATHERS, params.get('weather'))
	if (weather) view.weather = weather
	const lighting = oneOf(VIEW_LIGHTINGS, params.get('light'))
	if (lighting) view.lighting = lighting
	const hide = params.get('hide')
	if (hide !== null) view.hidden = VIEW_CATEGORIES.filter(category => hide.split(',').includes(category))
	const snapshot = params.get('snap')
	if (snapshot && SNAPSHOT.test(snapshot)) view.snapshot = snapshot
	return view
}

function clockText(minutes: number): string {
	const whole = ((Math.round(minutes) % 1440) + 1440) % 1440
	return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`
}

/** The query parameters of a view, rounded to the centimetre and the minute. */
export function viewParams(view: ViewLink): URLSearchParams {
	const params = new URLSearchParams()
	if (view.camera && view.target) {
		params.set('cam', view.camera.map(round).join(','))
		params.set('at', view.target.map(round).join(','))
	}
	if (view.minutes !== undefined) params.set('time', clockText(view.minutes))
	if (view.weather) params.set('weather', view.weather)
	if (view.lighting) params.set('light', view.lighting)
	if (view.hidden?.length) params.set('hide', view.hidden.join(','))
	if (view.snapshot) params.set('snap', view.snapshot)
	return params
}

/** `url` with `view` in its query, replacing any view already there and keeping its other parameters. */
export function withViewLink(url: string, view: ViewLink): string {
	const address = new URL(url)
	for (const key of VIEW_KEYS) address.searchParams.delete(key)
	for (const [key, value] of viewParams(view)) address.searchParams.set(key, value)
	// URLSearchParams escapes commas and colons; both are safe in a query and keep the link readable (17:05).
	return address.toString().replaceAll('%2C', ',').replaceAll('%3A', ':')
}
