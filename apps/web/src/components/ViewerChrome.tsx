import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useI18n } from '../i18n/I18n'

export function ViewerHeader({
	title,
	subtitle,
	children,
	back = '/gallery',
	backLabel,
}: {
	title: string
	subtitle: string
	children?: ReactNode
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
		</header>
	)
}

export function ViewerLoadState({ loading, error }: { loading: string | null; error: string }) {
	const { t } = useI18n()
	if (!(loading || error)) return null
	return (
		<div className="cinema-loading" role={error ? 'alert' : 'status'} aria-live="polite">
			<div className="cinema-loading-card">
				<span className="cinema-kicker">{t('A MOMENT OUTSIDE OF TIME')}</span>
				<h2>{error ? t('This memory will have to wait.') : t('The light returns.')}</h2>
				{loading && <div className="cinema-loading-line" />}
				<p>{t(error || loading || '')}</p>
			</div>
		</div>
	)
}

export function ViewerEmptyState() {
	const { t } = useI18n()
	return (
		<div className="cinema-empty">
			<div className="cinema-orbit" aria-hidden="true">
				<span>✧</span>
			</div>
			<span className="cinema-kicker">{t('YOUR WORLDS. YOUR STORY.')}</span>
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
