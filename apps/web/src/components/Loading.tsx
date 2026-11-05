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

/* The content pages' mark: a grass block of the landing's captures, rendered in the same isometric view as the scenes (public/hero/scenes/). */
export function BlockMark({ className = '' }: { className?: string }) {
	return (
		<img
			className={`mm-block-mark ${className}`}
			src="/hero/scenes/bloc-herbe.webp"
			alt=""
			aria-hidden="true"
			width="214"
			height="246"
			decoding="async"
		/>
	)
}
