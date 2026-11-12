import { type ReactNode, useState } from 'react'
import { useI18n } from '../i18n/I18n'
import { icons, PixelIcon } from './GalleryIcons'
import './explainers.css'

/**
 * The shared pieces of the explainer pages (concept, how it works, FAQ, privacy, sharing...): pixel pictograms,
 * a tab strip, a copyable command and a closed-by-default details block. Text stays short here: the pictogram
 * and the diagram carry the idea, the details block carries the fine print.
 */
const extraGlyphs = {
	lock: ['..####..', '.#....#.', '.#....#.', '########', '###..###', '###..###', '###..###', '########'],
	person: ['..####..', '..####..', '..####..', '...##...', '.######.', '########', '.##..##.', '.##..##.'],
	code: ['........', '..#..#..', '.#....#.', '#......#', '.#....#.', '..#..#..', '........', '........'],
	key: ['.####...', '#....#..', '#....#..', '.####...', '..##....', '..###...', '..##....', '..###...'],
	crosshair: ['...##...', '...##...', '........', '##....##', '##....##', '........', '...##...', '...##...'],
	heart: ['.##..##.', '########', '########', '########', '.######.', '..####..', '...##...', '........'],
	home: ['...##...', '..####..', '.######.', '########', '.#....#.', '.#.##.#.', '.#.##.#.', '.######.'],
	shield: ['########', '#......#', '#......#', '#......#', '.#....#.', '.#....#.', '..#..#..', '...##...'],
	folder: ['........', '###.....', '########', '#......#', '#......#', '#......#', '########', '........'],
	file: ['.#####..', '.#...##.', '.#...###', '.#.....#', '.#.....#', '.#.....#', '.#######', '........'],
} satisfies Record<string, readonly string[]>
const glyphs = { ...icons, ...extraGlyphs }

export type GlyphName = keyof typeof glyphs

/** A pixel pictogram, always decorative: its meaning is repeated in the text next to it. */
export function Glyph({ name }: { name: GlyphName }) {
	return <PixelIcon className="ex-glyph" rows={glyphs[name]} />
}

/** A command or a path in the game's chat line, with a copy button. */
export function Command({ text }: { text: string }) {
	const { t } = useI18n()
	const [copied, setCopied] = useState('')
	async function copy() {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(text)
		} catch {
			setCopied('')
		}
	}
	return (
		<span className="ex-command">
			<code>{text}</code>
			<button
				type="button"
				className="ex-copy"
				aria-label={`${t('Copy')} : ${text}`}
				onClick={() => {
					void copy()
				}}
			>
				<Glyph name={copied === text ? 'check' : 'file'} />
			</button>
			<span role="status" className="ex-sr">
				{copied === text ? t('Copied') : ''}
			</span>
		</span>
	)
}

/** The fine print: closed by default, still in the page for search engines and for the people who need it. */
export function More({ label, children }: { label?: string; children: ReactNode }) {
	const { t } = useI18n()
	return (
		<details className="ex-more">
			<summary>{label ?? t('Details')}</summary>
			<div className="ex-more-body">{children}</div>
		</details>
	)
}

/** The export folder, drawn: where the latest capture and the dated ones are written. */
export function FileTree() {
	const { t } = useI18n()
	return (
		<ul className="ex-tree">
			<li>
				<Glyph name="folder" />
				<code>export</code>
				<ul>
					<li>
						<Glyph name="cube" />
						<code>capture.glb</code>
						<span>{t('Latest')}</span>
					</li>
					<li>
						<Glyph name="folder" />
						<code>history</code>
						<span>{t('Every dated capture')}</span>
					</li>
				</ul>
			</li>
		</ul>
	)
}
