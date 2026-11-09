import { useId, useState } from 'react'
import { useI18n } from '../i18n/I18n'
import { Command, Glyph, type GlyphName } from './explainers'
import { MemoryScene } from './MemoryScene'

/** The interactive diagrams of the explainer pages. Each one replaces a paragraph: the state is drawn, the words are labels. */

const MAP = 256
const SCALE = 0.9375 // 128 blocks of radius fill the 120 px between the player and the edge of the map
const CHUNK = 16

type Weight = 'light' | 'heavy'
const weightFor = (radius: number): Weight => (radius > 64 ? 'heavy' : 'light')

/** A top-down map around the player: drag the slider and the captured square grows with the radius of `/minemories export`. */
export function RadiusMap({ initial = 16 }: { initial?: number }) {
	const { t } = useI18n()
	const [radius, setRadius] = useState(initial)
	const field = useId()
	const grid = useId().replace(/:/g, '')
	const half = radius * SCALE
	const weight = weightFor(radius)
	const size = 2 * radius + 1
	return (
		<div className="ex-radius">
			<svg viewBox={`0 0 ${MAP} ${MAP}`} className="ex-map" role="img" aria-label={`${size} × ${size}`}>
				<defs>
					<pattern
						id={grid}
						width={CHUNK * SCALE}
						height={CHUNK * SCALE}
						patternUnits="userSpaceOnUse"
						x={MAP / 2}
						y={MAP / 2}
					>
						<path d={`M0 0H${CHUNK * SCALE}M0 0V${CHUNK * SCALE}`} className="ex-map-line" />
					</pattern>
				</defs>
				<rect width={MAP} height={MAP} className="ex-map-ground" />
				<rect width={MAP} height={MAP} fill={`url(#${grid})`} />
				<rect
					x={MAP / 2 - half}
					y={MAP / 2 - half}
					width={2 * half}
					height={2 * half}
					className={`ex-map-area ex-map-area--${weight}`}
				/>
				<rect x={MAP / 2 - 4} y={MAP / 2 - 4} width="8" height="8" className="ex-map-player" />
			</svg>
			<div className="ex-radius-controls ex-range-field">
				<label htmlFor={field}>{t('Radius in blocks')}</label>
				<input
					id={field}
					type="range"
					min="2"
					max="128"
					value={radius}
					onChange={event => setRadius(Number(event.target.value))}
				/>
				<output htmlFor={field} className="ex-size">
					{size} × {size}
				</output>
				<Command text={`/minemories export ${radius}`} />
				<p role="status" className="ex-warning" hidden={weight === 'light'}>
					<Glyph name="clock" />
					{t('A large area can slow the game.')}
				</p>
			</div>
		</div>
	)
}

export type ShareState = 'private' | 'link' | 'revoked'
const shareCaption: Record<ShareState, string> = {
	private: 'Only you can see it.',
	link: 'Anyone with the link can see it.',
	revoked: 'Link revoked. Copies already saved stay.',
}

/** A gallery card and three visitors: creating the link lights them up, revoking it closes the door. */
export function ShareDemo() {
	const { t } = useI18n()
	const [state, setState] = useState<ShareState>('private')
	const open = state === 'link'
	return (
		<div className="ex-share" data-state={state}>
			<div className="ex-share-stage">
				<div className="ex-share-card">
					<MemoryScene theme="village" label={t('Illustration of a small Minecraft world')} />
					<span className="ex-share-lock">
						<Glyph name={open ? 'view' : 'lock'} />
					</span>
				</div>
				<span className="ex-share-wire" aria-hidden="true" />
				<div className="ex-share-people" aria-hidden="true">
					<Glyph name="person" />
					<Glyph name="person" />
					<Glyph name="person" />
				</div>
			</div>
			<p role="status" className="ex-share-caption">
				{t(shareCaption[state])}
			</p>
			<div className="mm-actions">
				<button
					type="button"
					className="mm-button mc-btn mc-btn--auto"
					disabled={open}
					onClick={() => setState('link')}
				>
					{t('Create a link')}
				</button>
				<button
					type="button"
					className="mm-button mc-btn mc-btn--auto mm-button-outline"
					disabled={!open}
					onClick={() => setState('revoked')}
				>
					{t('Revoke the link')}
				</button>
			</div>
		</div>
	)
}

/** The server closes, the memory stays: the same build twice, one of them goes dark. */
export function SeasonDemo() {
	const { t } = useI18n()
	const [closed, setClosed] = useState(false)
	return (
		<div className="ex-season" data-closed={closed}>
			<figure className="ex-season-side ex-season-server">
				<MemoryScene theme="home" stage={closed ? 2 : 3} label={t('The server')} />
				<figcaption>
					<Glyph name={closed ? 'close' : 'check'} />
					{closed ? t('Closed') : t('Online')}
				</figcaption>
			</figure>
			<span className="ex-season-arrow" aria-hidden="true" />
			<figure className="ex-season-side ex-season-memory">
				<MemoryScene theme="home" label={t('Your 3D memory')} />
				<figcaption>
					<Glyph name="cube" />
					{t('Still here')}
				</figcaption>
			</figure>
			<button
				type="button"
				className="mm-button mc-btn mc-btn--auto mm-button-outline ex-season-button"
				aria-pressed={closed}
				onClick={() => setClosed(!closed)}
			>
				{closed ? t('Reopen the server') : t('Close the server')}
			</button>
		</div>
	)
}

interface FlowNode {
	glyph: GlyphName
	label: string
}

/** Boxes and arrows: where a capture goes, and which door each arrow opens. */
export function DataFlow({ nodes, edges }: { nodes: readonly FlowNode[]; edges: readonly FlowNode[] }) {
	const { t } = useI18n()
	return (
		<ol className="ex-flow">
			{nodes.map((node, index) => {
				const edge = edges[index]
				return (
					<li key={node.label} className="ex-flow-step">
						<span className="ex-flow-node">
							<Glyph name={node.glyph} />
							<span>{t(node.label)}</span>
						</span>
						{edge && (
							<span className="ex-flow-edge">
								<Glyph name={edge.glyph} />
								<span>{t(edge.label)}</span>
							</span>
						)}
					</li>
				)
			})}
		</ol>
	)
}
