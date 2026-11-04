/**
 * The interface's pixel icons, drawn like the game's GUI sprites: an 8 x 8 grid of square texels,
 * no curve and no anti-aliasing. Render them at a multiple of 8 px (16, 24, 32, 40) so each texel stays whole.
 */

/** Turns rows of `#` (filled texel) and `.` (empty) into one path of horizontal runs. */
export function pixelPath(rows: readonly string[]): string {
	let d = ''
	for (const [y, row] of rows.entries()) {
		let x = 0
		while (x < row.length) {
			if (row[x] !== '#') {
				x++
				continue
			}
			let end = x
			while (row[end + 1] === '#') end++
			d += `M${x} ${y}h${end - x + 1}v1h${x - end - 1}z`
			x = end + 1
		}
	}
	return d
}

export function PixelIcon({ className, rows }: { className: string; rows: readonly string[] }) {
	return (
		<svg className={className} viewBox="0 0 8 8" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
			<path d={pixelPath(rows)} />
		</svg>
	)
}

export const eyeRows = ['........', '..####..', '.#....#.', '#..##..#', '#..##..#', '.#....#.', '..####..', '........']
export const layersRows = [
	'...##...',
	'.######.',
	'...##...',
	'##....##',
	'..####..',
	'##....##',
	'..####..',
	'........',
]
export const refreshRows = [
	'..####.#',
	'.#....##',
	'#....###',
	'#.......',
	'#.......',
	'#......#',
	'.#....#.',
	'..####..',
]

const icons = {
	view: eyeRows,
	link: ['........', '........', '###..###', '#..##..#', '#..##..#', '###..###', '........', '........'],
	globe: ['..####..', '.#.##.#.', '#..##..#', '########', '#..##..#', '.#.##.#.', '..####..', '........'],
	trash: ['..####..', '########', '........', '.#.##.#.', '.#.##.#.', '.#.##.#.', '.#.##.#.', '..####..'],
	pencil: ['......#.', '.....###', '....###.', '...###..', '..###...', '.###....', '##......', '#.......'],
	layers: layersRows,
	restore: ['#.####..', '##....#.', '###....#', '.......#', '.......#', '#......#', '.#....#.', '..####..'],
	close: ['#......#', '.#....#.', '..#..#..', '...##...', '...##...', '..#..#..', '.#....#.', '#......#'],
	check: ['........', '.......#', '......##', '#....##.', '##..##..', '.####...', '..##....', '........'],
	refresh: refreshRows,
	clock: ['..####..', '.#....#.', '#..#...#', '#..#...#', '#..###.#', '#......#', '.#....#.', '..####..'],
	pin: ['..####..', '.#....#.', '#..##..#', '#..##..#', '.#....#.', '..#..#..', '...##...', '........'],
	leaf: ['.....###', '...##..#', '..#....#', '.#....#.', '.#...#..', '.#.##...', '.##.....', '#.......'],
	cloud: ['........', '...###..', '.##...#.', '#......#', '#......#', '.######.', '........', '.#.#.#..'],
	disk: ['.######.', '#......#', '#.####.#', '#......#', '#.####.#', '#......#', '.######.', '........'],
	cube: ['..######', '.#....##', '######.#', '#....#.#', '#....#.#', '#....##.', '######..', '........'],
} satisfies Record<string, readonly string[]>

export type GalleryIconName = keyof typeof icons

export function GalleryIcon({ name }: { name: GalleryIconName }) {
	return <PixelIcon className="gallery-icon" rows={icons[name]} />
}
