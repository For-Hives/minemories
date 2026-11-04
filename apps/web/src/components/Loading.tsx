import { useI18n } from '../i18n/I18n'

export function LoadingSkeleton({
	kind = 'page',
	label = 'Loading the page…',
}: {
	kind?: 'page' | 'gallery' | 'viewer' | 'account'
	label?: string
}) {
	const { t } = useI18n()
	if (kind === 'viewer')
		return (
			<div role="status" aria-busy="true" className="grid min-h-svh place-items-center bg-night text-ink">
				<div className="text-center">
					<span
						aria-hidden="true"
						className="mx-auto block size-4 bg-lime shadow-[0_0_0_2px_var(--outline)] motion-safe:animate-pulse"
					/>
					<p className="mt-6 font-[family-name:var(--f-ui)] text-base leading-6 text-muted-ink">{t(label)}</p>
				</div>
			</div>
		)
	return (
		<div className={`mm-loading mm-loading-${kind}`} role="status" aria-busy="true">
			<span className="sr-only">{t(label)}</span>
			<div aria-hidden="true" className="mm-skeleton-content">
				{kind === 'account' ? (
					<span className="mm-skeleton mm-skeleton-account" />
				) : (
					<>
						<span className="mm-skeleton mm-skeleton-title" />
						<span className="mm-skeleton mm-skeleton-line" />
						<div className="mm-skeleton-grid">
							{['first', 'second', 'third'].map(key => (
								<div className="mm-skeleton-card" key={key}>
									<span className="mm-skeleton mm-skeleton-image" />
									<span className="mm-skeleton mm-skeleton-line" />
								</div>
							))}
						</div>
					</>
				)}
			</div>
		</div>
	)
}

export function OrbitMark({ className = '' }: { className?: string }) {
	return (
		<svg viewBox="0 0 120 120" fill="none" aria-hidden="true" className={`mm-orbit ${className}`}>
			<g className="mm-orbit-ring">
				<ellipse
					cx="60"
					cy="60"
					rx="50"
					ry="24"
					transform="rotate(-30 60 60)"
					stroke="currentColor"
					strokeDasharray="3 6"
				/>
				<circle cx="102" cy="32" r="5" fill="currentColor" />
			</g>
			<g className="mm-orbit-cube">
				<path d="m35 45 25-14 25 14-25 14Z" fill="#ffb347" />
				<path d="m35 45 25 14v29L35 74Z" fill="#c98b55" />
				<path d="m60 59 25-14v29L60 88Z" fill="#8a5a2b" />
			</g>
		</svg>
	)
}
