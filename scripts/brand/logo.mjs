/**
 * Pure helpers behind `bun brand:icons`: read the canonical logo SVG (`design/logo/minemories-logo.svg`),
 * keep its parts in drawing order and write the web logo, the square icon (the whole logo, for the favicons and app
 * icons) and the square mark (the camera head, for the footer and the mod icon) from them.
 */

/** Parts of the camera head. The neck, the tripod ring, the hub and the legs stay out of the square mark. */
export const HEAD_PARTS = ['Body', 'Grip', 'Lens', 'Barrel', 'Viewfinder', 'ButtonGlow', 'Button']

/** Every output of the generator, relative to the repository root. `size` is in pixels. */
export const ICONS = {
	favicon: { file: 'apps/web/public/favicon.ico', sizes: [16, 32, 48] },
	appleTouch: { file: 'apps/web/public/apple-touch-icon.png', size: 180, scale: 0.86 },
	// The maskable safe zone is a centred circle of radius 0.4 × size. The whole logo is about 0.62 as wide as it is
	// tall, so its half-diagonal is about 0.56 of the square's side: drawn at 0.66 of the icon, it stays inside.
	app: [
		{ file: 'apps/web/public/icon-192.png', size: 192, scale: 0.66 },
		{ file: 'apps/web/public/icon-512.png', size: 512, scale: 0.66 },
	],
	mod: { file: 'mod/shared/brand/icon.png', size: 128 },
	og: { file: 'apps/web/public/brand/og-image.png', width: 1200, height: 630 },
}

export const BACKGROUND = '#14110e'
/** Warm light behind the logo on filled icons: the dark camera body would melt into the plain site background. */
export const GLOW = '#5b3b25'
export const INK = '#f4efe6'

const PATH = /<path\b([^>]*?)\/>/g
const ATTRIBUTE = /([a-zA-Z-]+)="([^"]*)"/g
const GRADIENT = /<radialGradient\b[^>]*>[\s\S]*?<\/radialGradient>/
const ID = /id="([^"]+)"/
const EXPORT_SUFFIX = /-\d+$/
const UNSUPPORTED_COMMAND = /[a-zHVSQTA]/
const EXPONENT = /e-?\d/g
const NUMBER = /-?\d+(\.\d+)?/g
const ROOT_VIEWBOX = /<svg\b[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"/

function attributesOf(source) {
	const attributes = {}
	for (const [, name, value] of source.matchAll(ATTRIBUTE)) attributes[name] = value
	return attributes
}

/** Each `<path>` of the source with its part name (the id without the `-2`, `-3` suffix the exporter adds). */
export function parseLogo(svg) {
	const gradient = svg.match(GRADIENT)?.[0]
	if (!gradient) throw new Error('The logo has no radial gradient for the button glow')
	const gradientId = gradient.match(ID)[1]
	const paths = []
	for (const [, source] of svg.matchAll(PATH)) {
		const { id, d, fill, stroke } = attributesOf(source)
		if (!(id && d && fill)) throw new Error(`A logo path lacks an id, a shape or a fill: ${source.slice(0, 80)}`)
		paths.push({ part: id.replace(EXPORT_SUFFIX, ''), d, fill, stroke })
	}
	return { gradient, gradientId, paths }
}

/** Bounding box of the path coordinates (the logo only uses absolute M, L, C and Z commands). */
export function boundsOf(paths) {
	let [x0, y0, x1, y1] = [
		Number.POSITIVE_INFINITY,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	]
	for (const { d } of paths) {
		if (UNSUPPORTED_COMMAND.test(d.replace(EXPONENT, '')))
			throw new Error(`Unsupported path command in ${d.slice(0, 40)}`)
		const numbers = d.match(NUMBER).map(Number)
		for (let index = 0; index + 1 < numbers.length; index += 2) {
			x0 = Math.min(x0, numbers[index])
			x1 = Math.max(x1, numbers[index])
			y0 = Math.min(y0, numbers[index + 1])
			y1 = Math.max(y1, numbers[index + 1])
		}
	}
	return { x0, y0, x1, y1 }
}

/** A square around the bounds, centred on them, with `padding` (a share of the longest side) on each side. */
export function squareAround({ x0, y0, x1, y1 }, padding) {
	const side = Math.ceil(Math.max(x1 - x0, y1 - y0) * (1 + 2 * padding))
	const round = value => Math.round(value * 10) / 10
	return { x: round((x0 + x1 - side) / 2), y: round((y0 + y1 - side) / 2), width: side, height: side }
}

/** Consecutive paths of the same part, in drawing order. */
function groupByPart(paths) {
	const groups = []
	for (const path of paths) {
		const last = groups.at(-1)
		if (last?.part === path.part) last.paths.push(path)
		else groups.push({ part: path.part, paths: [path] })
	}
	return groups
}

/**
 * An optimised SVG of `paths`. Each flat shape keeps a stroke of its own colour, which hides the hairline seams
 * between neighbouring polygons; the glow keeps its gradient under an id unique to this file.
 */
export function renderSvg({ gradient, gradientId, paths }, { viewBox, glowId }) {
	const { x, y, width, height } = viewBox
	const lines = [
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}">`,
		'<title>Minemories</title>',
		`<defs>${gradient.replace(`id="${gradientId}"`, `id="${glowId}"`).replace(/\s*\n\s*/g, '')}</defs>`,
		'<g stroke-width="0.6" stroke-linejoin="round">',
	]
	for (const { part, paths: shapes } of groupByPart(paths)) {
		const body = shapes.map(({ d, fill, stroke }) => {
			const paint = fill.startsWith('url(') ? `fill="url(#${glowId})"` : `fill="${fill}" stroke="${stroke ?? fill}"`
			return `<path ${paint} d="${d.replace(/ ([LCZ])/g, '$1').replace(/([LCMZ]) /g, '$1')}"/>`
		})
		lines.push(`<g id="${part}">${body.join('')}</g>`)
	}
	lines.push('</g>', '</svg>', '')
	return lines.join('\n')
}

/**
 * The full logo (camera and tripod), the square icon (the full logo centred in a square, for the favicons) and the
 * square mark (camera head only) from the canonical SVG.
 */
export function buildLogos(svg, { padding = 0.03 } = {}) {
	const logo = parseLogo(svg)
	const size = svg.match(ROOT_VIEWBOX)
	if (!size) throw new Error('The logo needs a viewBox starting at 0 0')
	const head = logo.paths.filter(path => HEAD_PARTS.includes(path.part))
	const solidHead = head.filter(path => !path.fill.startsWith('url('))
	const markBox = squareAround(boundsOf(solidHead), padding)
	const iconBox = squareAround(boundsOf(logo.paths.filter(path => !path.fill.startsWith('url('))), padding)
	return {
		logo: renderSvg(logo, {
			viewBox: { x: 0, y: 0, width: Number(size[1]), height: Number(size[2]) },
			glowId: 'mm-logo-glow',
		}),
		icon: renderSvg(logo, { viewBox: iconBox, glowId: 'mm-icon-glow' }),
		iconBox,
		mark: renderSvg({ ...logo, paths: head }, { viewBox: markBox, glowId: 'mm-mark-glow' }),
		markBox,
		size: { width: Number(size[1]), height: Number(size[2]) },
	}
}

/** ImageMagick density (dpi) that renders an SVG of `userUnits` wide at `pixels` wide; librsvg maps 96 dpi to 1:1. */
export function densityFor(userUnits, pixels) {
	return Math.round(((96 * pixels) / userUnits) * 1000) / 1000
}

export function webManifest() {
	const icons = ICONS.app.flatMap(({ file, size }) =>
		['any', 'maskable'].map(purpose => ({
			src: `/${file.split('/').at(-1)}`,
			sizes: `${size}x${size}`,
			type: 'image/png',
			purpose,
		}))
	)
	return {
		name: 'Minemories',
		short_name: 'Minemories',
		start_url: '/',
		display: 'standalone',
		background_color: BACKGROUND,
		theme_color: BACKGROUND,
		icons,
	}
}
