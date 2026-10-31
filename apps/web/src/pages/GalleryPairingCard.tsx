import { GalleryIcon } from '../components/GalleryIcons'
import { useI18n } from '../i18n/I18n'
import type { PairingStatus, useGalleryPairing } from './gallery-pairing'
export function GalleryPairingCard({
	pairing,
	pairedFresh,
}: {
	pairing: ReturnType<typeof useGalleryPairing>
	pairedFresh: boolean
}) {
	const { t } = useI18n()
	const { pairStatus, pairCode, pairExpires, pairBusy, createPairing, copyCode } = pairing
	const pending = pairStatus === 'pending'
	const note = pairingNote(pairedFresh, pairStatus)
	return (
		<section className="gallery-link" data-linked={pairedFresh} aria-live="polite">
			<span className="gallery-link-icon" aria-hidden="true">
				<GalleryIcon name={pairedFresh ? 'check' : 'cube'} />
			</span>
			<div className="gallery-link-text">
				<h2>{pairedFresh ? t('Your mod is paired.') : t('Link Minecraft to your gallery.')}</h2>
				{note && <p>{t(note)}</p>}
			</div>
			{pending ? (
				<div className="gallery-link-code">
					<small>{t('CODE FOR THE GAME')}</small>
					<button type="button" onClick={copyCode} aria-label={t('Copy the pairing code')}>
						{pairCode.slice(0, 3)} {pairCode.slice(3)}
					</button>
					<small className="gallery-link-wait">
						<i aria-hidden="true" /> {t('Waiting for Minecraft…')}
						<span>
							{t('Expires at')} {pairExpires}
						</span>
					</small>
				</div>
			) : (
				<button className="gallery-view" type="button" onClick={() => void createPairing()} disabled={pairBusy}>
					{t(pairingButtonLabel(pairBusy, pairedFresh))} <span>↗</span>
				</button>
			)}
		</section>
	)
}
function pairingButtonLabel(busy: boolean, pairedFresh: boolean): string {
	if (busy) return 'Creating…'
	return pairedFresh ? 'New code' : 'Link my server'
}

/** Only failures and stale links deserve a sentence; the happy path stays quiet. */
function pairingNote(pairedFresh: boolean, status: PairingStatus): string | null {
	if (status === 'expired') return 'This code expired. Generate a new one.'
	if (status === 'error') return 'Verification failed. Check that the API is running.'
	if (status === 'paired' && !pairedFresh)
		return 'No snapshot for two months. Link the mod again to resume auto-upload.'
	return null
}
