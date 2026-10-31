import type { ReactNode } from 'react'
import { GalleryIcon, type GalleryIconName } from '../components/GalleryIcons'
import { useI18n } from '../i18n/I18n'
import { formatRelativeDate } from '../lib/dates'
import { biomeLabel, blockCoordinates } from '../lib/gallery'
import { formatFileSize } from '../lib/glb'
import { formatClock } from '../viewer-scene'
import type { Memories } from './gallery-data'

type Memory = Memories[number]

export const dimensionLabels: Record<string, string> = {
	'minecraft:overworld': 'Overworld',
	'minecraft:the_nether': 'Nether',
	'minecraft:the_end': 'The End',
}

export function Fact({
	icon,
	label,
	children,
	wide = false,
}: {
	icon: GalleryIconName
	label: string
	children: ReactNode
	wide?: boolean
}) {
	return (
		<div className="gallery-fact" data-wide={wide}>
			<dt>
				<GalleryIcon name={icon} />
				{label}
			</dt>
			<dd>{children}</dd>
		</div>
	)
}

/** Minecraft day ticks start at 06:00. */
function worldClock(dayTime: number): string {
	return formatClock(Math.round(((((dayTime % 24_000) + 30_000) % 24_000) * 1440) / 24_000) % 1440)
}

/** Everything the mod recorded about one capture, laid out as a glanceable grid. */
export function CaptureFacts({ memory }: { memory: Memory }) {
	const { t, locale } = useI18n()
	const { metadata } = memory
	const place = blockCoordinates(metadata)
	const captured = metadata.capturedAt ?? memory.createdAt
	const weather = [metadata.raining && t('Rain'), metadata.thundering && t('Thunder')].filter(Boolean).join(' · ')
	const dimension = metadata.dimension
	return (
		<dl className="gallery-facts">
			<Fact icon="clock" label={t('Captured')} wide>
				<time dateTime={captured}>{new Date(captured).toLocaleString(locale)}</time>
				<small>{formatRelativeDate(captured, Date.now(), locale)}</small>
			</Fact>
			{dimension && (
				<Fact icon="globe" label={t('Dimension')}>
					<span className="gallery-fact-dimension" data-dimension={dimensionLabels[dimension] ?? 'modded'}>
						{t(dimensionLabels[dimension] ?? dimension)}
					</span>
				</Fact>
			)}
			{metadata.biome && (
				<Fact icon="leaf" label={t('Biome')}>
					{biomeLabel(metadata.biome)}
				</Fact>
			)}
			{place && (
				<Fact icon="pin" label={t('Position')} wide>
					<span className="gallery-fact-axes">
						<span>
							<b>X</b>
							{place.x}
						</span>
						{place.y !== null && (
							<span>
								<b>Y</b>
								{place.y}
							</span>
						)}
						<span>
							<b>Z</b>
							{place.z}
						</span>
					</span>
				</Fact>
			)}
			{metadata.dayTime !== null && (
				<Fact icon="clock" label={t('Time of day')}>
					{worldClock(metadata.dayTime)}
				</Fact>
			)}
			{weather && (
				<Fact icon="cloud" label={t('Weather')}>
					{weather}
				</Fact>
			)}
			<Fact icon="disk" label={t('Size')}>
				{formatFileSize(memory.size, locale)}
			</Fact>
			{metadata.seed && (
				<Fact icon="cube" label={t('Seed')} wide>
					<code>{metadata.seed}</code>
				</Fact>
			)}
		</dl>
	)
}
