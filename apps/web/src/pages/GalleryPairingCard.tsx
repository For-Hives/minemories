import { buttonLime, Eyebrow } from '../components/ui'
import { T, useI18n } from '../i18n/I18n'
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
	return (
		<section
			className={`my-[31px] mb-12 flex items-center gap-[18px] rounded-lg border bg-[#1c2720] px-[23px] py-[22px] max-phone:m-[24px_0_35px] max-phone:grid max-phone:grid-cols-[42px_1fr] max-phone:gap-[10px_12px] max-phone:p-[15px] ${
				pairedFresh ? 'border-[#354238] bg-[#1c2720]' : 'border-[#354238]'
			}`}
			aria-live="polite"
		>
			<div className="grid h-[47px] w-[47px] flex-none place-items-center rounded-xl bg-[#1c2720] text-[22px] text-[#b4c1ad] max-phone:h-10 max-phone:w-10 max-phone:rounded-[10px] max-phone:text-lg">
				{pairedFresh ? '✓' : '⌘'}
			</div>
			<div className="flex-1">
				<Eyebrow>{pairedFresh ? t('LINKED') : t('CAPTURE FROM THE SERVER')}</Eyebrow>
				<h2 className="mb-1 mt-[5px] font-sans text-base font-bold tracking-[-0.35px] max-phone:text-sm">
					{pairedFresh ? t('Your mod is paired.') : t('Link Minecraft to your gallery.')}
				</h2>
				<p className="m-0 text-[11px] leading-[1.55] text-[#b4c1ad] max-phone:text-[10px]">
					{t(pairingMessage(pairedFresh, pairStatus))}
				</p>
				{pairStatus === 'pending' && (
					<div className="mt-[10px] flex items-center gap-2 text-[10px] font-semibold text-[#b4c1ad]">
						<span className="h-[7px] w-[7px] animate-pulse-dot rounded-full bg-[#85a555] shadow-[0_0_0_0_#85a55599]" />{' '}
						<T message={'Waiting for Minecraft…'} />{' '}
					</div>
				)}
				{pairStatus === 'expired' && (
					<div className="mt-[10px] flex items-center gap-2 text-[10px] font-semibold text-[#b4c1ad]">
						{' '}
						<T message={'This code expired. Generate a new one.'} />{' '}
					</div>
				)}
				{pairStatus === 'error' && (
					<div className="mt-[10px] flex items-center gap-2 text-[10px] font-semibold text-[#b4c1ad]">
						{' '}
						<T message={'Verification failed. Check that the API is running.'} />{' '}
					</div>
				)}
				{pairStatus !== 'pending' && pairedFresh && (
					<p className="mt-[10px] text-[10px] text-[#8e978a]">{t(pairingHint(pairedFresh))}</p>
				)}
			</div>
			{pairStatus === 'pending' && (
				<div className="flex min-w-[181px] flex-col items-center border-l border-[#354238] px-[11px] py-[3px] max-phone:col-2 max-phone:mt-[5px] max-phone:items-start max-phone:justify-self-start max-phone:border-0 max-phone:p-[3px_0]">
					<span className="font-mono text-[8px] tracking-[0.4px] text-[#b4c1ad]">
						<T message={'CODE FOR THE GAME'} />
					</span>
					<button
						type="button"
						onClick={copyCode}
						aria-label={t('Copy the pairing code')}
						className="cursor-pointer border-0 bg-transparent px-0 py-[4px] pb-[2px] font-mono text-[28px] font-bold tracking-[2px] text-[#e6eee1] max-phone:text-[26px]"
					>
						{pairCode.slice(0, 3)} {pairCode.slice(3)}
					</button>
					<small className="text-[9px] text-[#b4c1ad]">
						<T message={'Expires at'} /> {pairExpires}
					</small>
				</div>
			)}
			{pairedFresh && (
				<span className="flex items-center gap-[7px] rounded-[20px] border border-[#354238] px-[11px] py-2 text-[10px] font-bold text-[#b4c1ad] max-phone:col-2 max-phone:justify-self-start">
					<i className="h-[7px] w-[7px] rounded-full bg-[#78a355] not-italic" /> <T message={'Linked client'} />{' '}
				</span>
			)}
			{pairStatus !== 'pending' && (
				<button
					className={`${buttonLime} min-w-[156px] max-phone:col-2 max-phone:min-h-[38px] max-phone:justify-self-start`}
					type="button"
					onClick={() => void createPairing()}
					disabled={pairBusy}
				>
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

function pairingMessage(pairedFresh: boolean, pairStatus: PairingStatus): string {
	if (pairedFresh) return 'Run /minemories upload after a capture. The gallery updates itself.'
	if (pairStatus === 'paired') return 'No snapshot for two months. Link the mod again to resume auto-upload.'
	return 'A temporary code links your profile to the game client. Once, and you are set.'
}

function pairingHint(pairedFresh: boolean): string {
	if (pairedFresh) return 'Already linked? Generate a fresh code for another device.'
	return 'A temporary code links your profile to the game client. Once, and you are set.'
}
