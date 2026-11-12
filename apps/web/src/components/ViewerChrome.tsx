import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useI18n } from '../i18n/I18n'
import { ChunkLoader } from './ChunkLoader'

export function ViewerHeader({
	title,
	subtitle,
	children,
	below,
	back = '/gallery',
	backLabel,
}: {
	title: string
	subtitle: string
	children?: ReactNode
	/** A full-width row under the title (a shared scene's slider and visitor line): it never covers the title, whatever its length. */
	below?: ReactNode
	back?: string
	backLabel?: string
}) {
	const { t } = useI18n()
	return (
		<header className="cinema-header">
			<Link className="cinema-back" to={back} aria-label={backLabel ?? t('Back to gallery')}>
				←
			</Link>
			<div className="cinema-title">
				<span>
					minemories <i>/</i> {subtitle}
				</span>
				<h1>{title}</h1>
			</div>
			<div className="cinema-header-actions">{children}</div>
			{below && <div className="cinema-header-below">{below}</div>}
		</header>
	)
}

/**
 * `children` are the error's own actions (Retry, a link onward), shown under its sentence. A `final` error drops the
 * "will have to wait" heading: nothing will come back.
 */
export function ViewerLoadState({
	loading,
	error,
	final = false,
	children,
}: {
	loading: string | null
	error: string
	final?: boolean
	children?: ReactNode
}) {
	const { t } = useI18n()
	// while it loads, the world-loading screen of the landing; an error drops it at once for its card
	if (!error) return <ChunkLoader active={Boolean(loading)} label={loading ?? ''} />
	return (
		<div className="cinema-loading" role="alert" aria-live="polite">
			<div className="cinema-loading-card">
				{!final && <h2>{t('This memory will have to wait.')}</h2>}
				<p>{t(error)}</p>
				{children}
			</div>
		</div>
	)
}

export function ViewerEmptyState() {
	const { t } = useI18n()
	return (
		<div className="cinema-empty">
			<div className="cinema-orbit" aria-hidden="true">
				<span className="mc-icon mc-icon--ember" />
			</div>
			<h2>
				{t('Some places')}
				<br />
				<em>{t('stay with you.')}</em>
			</h2>
			<p>{t('Find the morning light, your first home, the paths you know by heart.')}</p>
			{import.meta.env.DEV ? (
				<>
					{' '}
					<label className="cinema-open-primary" htmlFor="local-file-input">
						{t('Open a memory')} <span>↗</span>
					</label>
					<small>{t('Drop a .glb here · It stays on your device')}</small>
				</>
			) : (
				<Link className="cinema-open-primary" to="/gallery">
					{t('My gallery')} ↗
				</Link>
			)}
		</div>
	)
}
