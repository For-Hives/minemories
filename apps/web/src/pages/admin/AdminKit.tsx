import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import { type Delta, linePath } from '../../lib/admin-insight'

/** A named set of related buttons (a fieldset, so it is announced as a group). */
export function Group({
	label,
	className,
	style,
	children,
}: {
	label: string
	className: string
	style?: CSSProperties | undefined
	children: ReactNode
}) {
	return (
		<fieldset className={className} style={style}>
			<legend className="sr-only">{label}</legend>
			{children}
		</fieldset>
	)
}

export type Tone = 'bad' | 'warn' | 'ok' | 'info' | 'lore' | 'ember'

/** `▲ +12 %` / `▼ −4 %`; nothing when there is no earlier value to compare with. `inverse` flips the colours where less is better. */
export function deltaText(delta: Delta, locale: string): string | null {
	if (!delta) return null
	const percent = `${delta.percent.toLocaleString(locale)} %`
	if (delta.direction === 'flat') return `= ${percent}`
	return `${delta.direction === 'up' ? '▲ +' : '▼ −'}${percent}`
}
const deltaClass = (delta: Delta, inverse: boolean) => {
	if (!delta || delta.direction === 'flat') return ''
	return (delta.direction === 'up') !== inverse ? 'is-up' : 'is-down'
}

export function Spark({ values, tone = 'ember' }: { values: readonly number[]; tone?: Tone }) {
	const max = Math.max(1, ...values)
	return (
		<svg className={`mm-con-spark is-tone-${tone}`} viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
			<path d={linePath(values, 120, 32, max)} fill="none" stroke="var(--tone)" strokeWidth="2" />
		</svg>
	)
}

/** One key figure: a label, a value, its change since the previous period, and a sparkline. A link when it leads somewhere. */
export function Kpi({
	label,
	value,
	delta,
	inverse = false,
	note,
	spark,
	tone = 'ember',
	to,
	locale,
}: {
	label: string
	value: ReactNode
	delta?: Delta | undefined
	inverse?: boolean
	note?: string
	spark?: readonly number[]
	tone?: Tone
	to?: string
	locale: string
}) {
	const change = delta === undefined ? null : deltaText(delta, locale)
	const body = (
		<>
			<span>{label}</span>
			<strong>{value}</strong>
			{change ? <small className={deltaClass(delta ?? null, inverse)}>{change}</small> : note && <small>{note}</small>}
			{spark && spark.length > 1 && <Spark values={spark} tone={tone} />}
		</>
	)
	return to ? (
		<Link className="mm-con-kpi" to={to}>
			{body}
		</Link>
	) : (
		<div className="mm-con-kpi">{body}</div>
	)
}

export function Card({
	title,
	hint,
	aside,
	children,
}: {
	title: string
	hint?: string
	aside?: ReactNode
	children: ReactNode
}) {
	return (
		<section className="mm-con-card">
			<header>
				<div>
					<h2>{title}</h2>
					{hint && <p className="mm-con-hint">{hint}</p>}
				</div>
				{aside}
			</header>
			{children}
		</section>
	)
}

export type MeterPart = { label: string; value: number; tone: Tone; text: string }

/** Stacked bar whose parts are also written out, so colour is never the only signal. */
export function Meter({ parts, total, label }: { parts: readonly MeterPart[]; total: number; label: string }) {
	const sum = Math.max(1, total)
	return (
		<>
			<div
				className="mm-con-meter"
				role="img"
				aria-label={`${label}: ${parts.map(p => `${p.label} ${p.text}`).join(', ')}`}
			>
				{parts.map(part => (
					<i key={part.label} className={`is-tone-${part.tone}`} style={{ width: `${(part.value / sum) * 100}%` }} />
				))}
			</div>
			<ul className="mm-con-legend">
				{parts.map(part => (
					<li key={part.label} className={`is-tone-${part.tone}`}>
						<i />
						{part.label} {part.text}
					</li>
				))}
			</ul>
		</>
	)
}

/** A labelled horizontal bar for ranked values (`share` 0 to 1). */
export function BarRow({
	label,
	share,
	text,
	tone = 'ember',
}: {
	label: string
	share: number
	text: string
	tone?: Tone
}) {
	return (
		<li className="mm-con-row">
			<span>{label}</span>
			<div className="mm-con-meter">
				<i className={`is-tone-${tone}`} style={{ width: `${Math.min(1, Math.max(0, share)) * 100}%` }} />
			</div>
			<output>{text}</output>
		</li>
	)
}
