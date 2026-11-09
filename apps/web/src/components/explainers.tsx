import { type KeyboardEvent, type ReactNode, useState } from 'react'
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

export interface TabSpec<T extends string> {
	id: T
	label: string
	glyph: GlyphName
}

const tabId = (base: string, id: string) => `${base}-tab-${id}`
const panelId = (base: string, id: string) => `${base}-panel-${id}`

/** A tab strip with the arrow keys of the ARIA pattern; the panels stay in the page (hidden) so that all text remains indexable. */
export function TabStrip<T extends string>({
	base,
	label,
	tabs,
	value,
	onChange,
}: {
	base: string
	label: string
	tabs: readonly TabSpec<T>[]
	value: T
	onChange: (id: T) => void
}) {
	function move(event: KeyboardEvent<HTMLDivElement>) {
		const index = tabs.findIndex(tab => tab.id === value)
		const steps: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 }
		const target = steps[event.key]
		if (target === undefined) return
		const next = tabs[(target + tabs.length) % tabs.length]
		if (!next) return
		event.preventDefault()
		onChange(next.id)
		document.getElementById(tabId(base, next.id))?.focus()
	}
	return (
		<div className="ex-tabs" role="tablist" aria-label={label} onKeyDown={move}>
			{tabs.map(tab => (
				<button
					key={tab.id}
					id={tabId(base, tab.id)}
					type="button"
					role="tab"
					aria-selected={tab.id === value}
					aria-controls={panelId(base, tab.id)}
					tabIndex={tab.id === value ? 0 : -1}
					className="ex-tab"
					onClick={() => onChange(tab.id)}
				>
					<Glyph name={tab.glyph} />
					<span>{tab.label}</span>
				</button>
			))}
		</div>
	)
}

export function TabPanel({
	base,
	id,
	active,
	children,
}: {
	base: string
	id: string
	active: boolean
	children: ReactNode
}) {
	return (
		<div
			role="tabpanel"
			id={panelId(base, id)}
			aria-labelledby={tabId(base, id)}
			hidden={!active}
			className="ex-tabpanel"
		>
			{children}
		</div>
	)
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

export type Verdict = 'yes' | 'no' | 'later' | 'depends'
const verdictGlyph: Record<Verdict, GlyphName> = { yes: 'check', no: 'close', later: 'clock', depends: 'layers' }
const verdictLabel: Record<Verdict, string> = { yes: 'Yes', no: 'No', later: 'Not yet', depends: 'Depends' }

/** A one-word answer, coloured and drawn, that can be read before the sentence. */
export function VerdictChip({ verdict }: { verdict: Verdict }) {
	const { t } = useI18n()
	return (
		<span className={`ex-verdict ex-verdict--${verdict}`}>
			<Glyph name={verdictGlyph[verdict]} />
			{t(verdictLabel[verdict])}
		</span>
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
