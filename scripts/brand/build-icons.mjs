/**
 * `bun brand:icons`: rebuilds every logo asset from the canonical `design/logo/minemories-logo.svg`.
 * Needs ImageMagick 7 (`magick`) with the librsvg SVG renderer. The outputs are committed; CI does not run this.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BACKGROUND, buildLogos, densityFor, GLOW, ICONS, INK, webManifest } from './logo.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const at = file => join(root, file)
const LOGO = 'apps/web/public/brand/minemories-logo.svg'
const MARK = 'apps/web/public/brand/minemories-mark.svg'
const FONT = 'apps/web/public/hero/assets/mc/fonts/mm-minecraft-bold.woff2'
// No creation dates in the PNG files, so a rebuild with the same inputs gives the same bytes.
const PNG_OUT = ['-depth', '8', '-strip', '-define', 'png:exclude-chunks=date,time']

function magick(...args) {
	const run = spawnSync('magick', args, { encoding: 'utf8' })
	if (run.error) throw new Error(`ImageMagick (magick) is required: ${run.error.message}`)
	if (run.status !== 0) throw new Error(`magick ${args.join(' ')}\n${run.stderr}`)
}

function write(file, content) {
	mkdirSync(dirname(at(file)), { recursive: true })
	writeFileSync(at(file), content)
	console.log(`wrote ${file}`)
}

/** Renders `svg` (user units `units` wide) to a transparent PNG exactly `width` × `height` pixels. */
function render(svg, units, width, height, output) {
	magick(
		'-background',
		'none',
		'-density',
		String(densityFor(units, width)),
		`rsvg:${svg}`,
		'-gravity',
		'center',
		'-extent',
		`${width}x${height}`,
		...PNG_OUT,
		output
	)
}

/** The mark centred on the site background, at `scale` of the square, with no transparency left. */
function tile(mark, side, size, scale, output, work) {
	const art = join(work, `tile-${size}.png`)
	const inner = Math.round(size * scale)
	render(mark, side, inner, inner, art)
	magick(
		'-size',
		`${size}x${size}`,
		'-define',
		`gradient:radii=${Math.round(size * 0.55)},${Math.round(size * 0.55)}`,
		`radial-gradient:${GLOW}-${BACKGROUND}`,
		art,
		'-gravity',
		'center',
		'-composite',
		'-alpha',
		'off',
		...PNG_OUT,
		output
	)
}

/** Width in pixels of `text` set in the game font at `pointsize`. */
function textWidth(text, pointsize) {
	const run = spawnSync(
		'magick',
		['-font', at(FONT), '-pointsize', String(pointsize), `label:${text}`, '-format', '%w', 'info:'],
		{
			encoding: 'utf8',
		}
	)
	if (run.status !== 0) throw new Error(`Cannot measure the title: ${run.stderr}`)
	return Number(run.stdout)
}

/** The full logo and the word "Minemories" in the game font, centred together on the site background. */
function socialImage(logo, work) {
	const { file, width, height } = ICONS.og
	const art = join(work, 'og-logo.png')
	const logoHeight = 480
	const logoWidth = Math.round((logoHeight * 584) / 938)
	const pointsize = 80
	const gap = 56
	const left = Math.round((width - logoWidth - gap - textWidth('Minemories', pointsize)) / 2)
	render(logo, 584, logoWidth, logoHeight, art)
	// biome-ignore format: one ImageMagick option and its value per line
	magick(
		'-size', `${width}x${height}`,
		'-define', `gradient:center=${left + Math.round(logoWidth / 2)},${Math.round(height / 2)}`,
		'-define', `gradient:radii=${Math.round(height * 0.62)},${Math.round(height * 0.62)}`,
		`radial-gradient:${GLOW}-${BACKGROUND}`,
		art, '-gravity', 'west', '-geometry', `+${left}+0`, '-composite',
		'-font', at(FONT), '-pointsize', String(pointsize), '-fill', INK,
		'-annotate', `+${left + logoWidth + gap}+0`, 'Minemories',
		'-alpha', 'off', ...PNG_OUT, at(file),
	)
	console.log(`wrote ${file}`)
}

function main() {
	const { logo, mark, markBox } = buildLogos(readFileSync(at('design/logo/minemories-logo.svg'), 'utf8'))
	write(LOGO, logo)
	write(MARK, mark)
	write('apps/web/public/favicon.svg', mark)
	console.log(`mark viewBox: ${markBox.x} ${markBox.y} ${markBox.width} ${markBox.height}`)

	const side = markBox.width
	const work = mkdtempSync(join(tmpdir(), 'minemories-icons-'))
	try {
		const frames = ICONS.favicon.sizes.map(size => {
			const frame = join(work, `favicon-${size}.png`)
			render(at(MARK), side, size, size, frame)
			return frame
		})
		// TrueColorAlpha: otherwise a frame with few colours (16 px) is palettised with 1-bit alpha, which leaves dark
		// opaque pixels around the edges.
		magick(...frames, '-type', 'TrueColorAlpha', at(ICONS.favicon.file))
		console.log(`wrote ${ICONS.favicon.file}`)

		const { appleTouch, app, mod } = ICONS
		for (const icon of [appleTouch, ...app]) {
			tile(at(MARK), side, icon.size, icon.scale, at(icon.file), work)
			console.log(`wrote ${icon.file}`)
		}
		mkdirSync(dirname(at(mod.file)), { recursive: true })
		render(at(MARK), side, mod.size, mod.size, at(mod.file))
		console.log(`wrote ${mod.file}`)

		socialImage(at(LOGO), work)
	} finally {
		rmSync(work, { recursive: true, force: true })
	}
	write('apps/web/public/site.webmanifest', `${JSON.stringify(webManifest(), null, '\t')}\n`)
}

main()
