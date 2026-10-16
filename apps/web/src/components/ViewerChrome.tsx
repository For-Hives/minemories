import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useI18n } from '../i18n/I18n'
import { useLocalizedCopy } from '../i18n/useLocalizedCopy'

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
	const { copy } = useLocalizedCopy()
	return (
		<header className="cinema-header">
			<Link className="cinema-back" to={back} aria-label={backLabel ?? copy('Retour à la galerie', 'Back to gallery')}>
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
	const { copy } = useLocalizedCopy()
	const { t } = useI18n()
	if (!(loading || error)) return null
	return (
		<div className="cinema-loading" role={error ? 'alert' : 'status'} aria-live="polite">
			<div className="cinema-loading-card">
				<span className="cinema-kicker">{copy('UN INSTANT HORS DU TEMPS', 'A MOMENT OUTSIDE OF TIME')}</span>
				<h2>
					{error
						? copy('Ce souvenir attendra un instant.', 'This memory will have to wait.')
						: copy('La lumière revient.', 'The light returns.')}
				</h2>
				{loading && <div className="cinema-loading-line" />}
				<p>{t(error || loading || '')}</p>
			</div>
		</div>
	)
}

export function ViewerEmptyState() {
	const { copy } = useLocalizedCopy()
	return (
		<div className="cinema-empty">
			<div className="cinema-orbit" aria-hidden="true">
				<span>✧</span>
			</div>
			<span className="cinema-kicker">{copy('VOS MONDES. VOTRE HISTOIRE.', 'YOUR WORLDS. YOUR STORY.')}</span>
			<h2>
				{copy('Certains endroits', 'Some places')}
				<br />
				<em>{copy('ne s’oublient pas.', 'stay with you.')}</em>
			</h2>
			<p>
				{copy(
					'Retrouvez la lumière d’un matin, votre première maison, les chemins que vous connaissez par cœur.',
					'Find the morning light, your first home, the paths you know by heart.'
				)}
			</p>
			{import.meta.env.DEV ? (
				<>
					{' '}
					<label className="cinema-open-primary" htmlFor="local-file-input">
						{copy('Ouvrir un souvenir', 'Open a memory')} <span>↗</span>
					</label>
					<small>
						{copy(
							'Glissez un fichier .glb ici · Il reste sur votre appareil',
							'Drop a .glb here · It stays on your device'
						)}
					</small>
				</>
			) : (
				<Link className="cinema-open-primary" to="/explorer">
					{copy('Explorer les souvenirs', 'Explore memories')} ↗
				</Link>
			)}
		</div>
	)
}
