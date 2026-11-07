import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { boundsOf, buildLogos, densityFor, HEAD_PARTS, ICONS, parseLogo, squareAround, webManifest } from './logo.mjs'

const canonical = readFileSync(new URL('../../design/logo/minemories-logo.svg', import.meta.url), 'utf8')

test('the canonical logo parses into named parts in drawing order', () => {
	const { paths, gradientId } = parseLogo(canonical)
	assert.equal(gradientId, 'radial-gradient-1')
	const parts = [...new Set(paths.map(path => path.part))]
	assert.deepEqual(parts.slice(0, 3), ['Body', 'Lens', 'Barrel'])
	assert.equal(parts.at(-1), 'Button')
	// The grip sits behind the body in this view, so it has no visible face and no path.
	for (const part of HEAD_PARTS.filter(part => part !== 'Grip')) assert.ok(parts.includes(part), part)
})

test('the bounds cover every coordinate pair and reject relative commands', () => {
	assert.deepEqual(boundsOf([{ d: 'M10 20 L-5 40 C1 2 3 4 30 5 Z' }]), { x0: -5, y0: 2, x1: 30, y1: 40 })
	assert.throws(() => boundsOf([{ d: 'M0 0 l10 10 Z' }]), /Unsupported/)
})

test('the square is centred on the bounds with padding on the longest side', () => {
	assert.deepEqual(squareAround({ x0: 0, y0: 0, x1: 100, y1: 50 }, 0.1), { x: -10, y: -35, width: 120, height: 120 })
})

test('the mark keeps only the camera head, in a square, and each file has its own glow id', () => {
	const { logo, mark, markBox } = buildLogos(canonical)
	assert.equal(markBox.width, markBox.height)
	assert.match(logo, /viewBox="0 0 568 864"/)
	assert.match(logo, /id="LegBack"/)
	assert.doesNotMatch(mark, /id="(Neck|TripodRing|Hub|Leg\w*)"/)
	assert.match(mark, /id="Lens"/)
	assert.match(mark, /url\(#mm-mark-glow\)/)
	assert.match(logo, /url\(#mm-logo-glow\)/)
	assert.doesNotMatch(mark, /radial-gradient-1|data-name/)
})

test('a logo without a gradient or with an incomplete path is refused', () => {
	assert.throws(() => parseLogo('<svg><path id="a" d="M0 0Z" fill="#000"/></svg>'), /radial gradient/)
	assert.throws(
		() => parseLogo('<svg><radialGradient id="g"></radialGradient><path id="a" fill="#000"/></svg>'),
		/lacks/
	)
	assert.throws(() => buildLogos('<svg><radialGradient id="g"></radialGradient></svg>'), /viewBox/)
})

test('the density renders the requested pixel width', () => {
	assert.equal(densityFor(96, 96), 96)
	assert.equal(densityFor(579, 32), 5.306)
})

test('the manifest lists each app icon as any and maskable on the site background', () => {
	const manifest = webManifest()
	assert.equal(manifest.background_color, '#14110e')
	assert.equal(manifest.theme_color, '#14110e')
	assert.deepEqual(
		manifest.icons.map(icon => `${icon.src} ${icon.sizes} ${icon.purpose}`),
		[
			'/icon-192.png 192x192 any',
			'/icon-192.png 192x192 maskable',
			'/icon-512.png 512x512 any',
			'/icon-512.png 512x512 maskable',
		]
	)
	assert.deepEqual(ICONS.favicon.sizes, [16, 32, 48])
	// The head's half-diagonal (≈ 0.61 of the mark) must stay inside the maskable circle of radius 0.4.
	for (const { scale } of ICONS.app) assert.ok(0.61 * scale <= 0.4, `scale ${scale}`)
})
