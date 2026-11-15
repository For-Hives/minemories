import type { AdminAnalytics } from '@minemories/api-contract'
import { useI18n } from '../../i18n/I18n'
import { shareOf } from '../../lib/admin-insight'
import { formatBytes } from '../../lib/bytes'
import { BarRow, Card, Kpi, Meter } from './AdminKit'
import { ConsoleHeader } from './ConsoleHeader'
import { useConsole } from './console'

type Translate = ReturnType<typeof useI18n>['t']
type Loc = ReturnType<typeof useI18n>['locale']
const percent = (value: number, locale: Loc) => `${Math.round(value * 100).toLocaleString(locale)} %`
const SIZE_LABELS = ['<5 MB', '5–20', '20–50', '50–100', '100–250', '>250 MB']

function Ranked({
	title,
	hint,
	rows,
	locale,
}: {
	title: string
	hint: string
	rows: AdminAnalytics['worlds']['biomes']
	locale: Loc
}) {
	const top = Math.max(1, ...rows.map(row => row.count))
	return (
		<Card title={title} hint={hint}>
			<ul className="mm-con-rows">
				{rows.map(row => (
					<BarRow key={row.name} label={row.name} share={row.count / top} text={row.count.toLocaleString(locale)} />
				))}
			</ul>
		</Card>
	)
}

function Where({ worlds, locale, t }: { worlds: AdminAnalytics['worlds']; locale: Loc; t: Translate }) {
	const tones = ['info', 'ember', 'lore', 'ok'] as const
	return (
		<Card title={t('Where they are')} hint={t('Dimension, and server or singleplayer')}>
			<Meter
				label={t('Dimension')}
				total={worlds.captures}
				parts={worlds.dimensions.slice(0, 4).map((row, index) => ({
					label: row.name,
					value: row.count,
					tone: tones[index % tones.length] as (typeof tones)[number],
					text: percent(shareOf(row.count, worlds.captures), locale),
				}))}
			/>
			<h3 className="mm-con-subhead">{t('Server or singleplayer')}</h3>
			<Meter
				label={t('Server or singleplayer')}
				total={worlds.captures}
				parts={[
					{
						label: t('Server'),
						value: worlds.onServer,
						tone: 'ember',
						text: percent(shareOf(worlds.onServer, worlds.captures), locale),
					},
					{
						label: t('Singleplayer'),
						value: worlds.singleplayer,
						tone: 'info',
						text: percent(shareOf(worlds.singleplayer, worlds.captures), locale),
					},
				]}
			/>
		</Card>
	)
}

function Sizes({ worlds, locale, t }: { worlds: AdminAnalytics['worlds']; locale: Loc; t: Translate }) {
	const biggest = Math.max(1, ...worlds.sizes)
	return (
		<Card title={t('Capture size')} hint={t('Number of captures by size')}>
			<div className="mm-con-hist" role="img" aria-label={t('Capture size')}>
				{worlds.sizes.map((count, index) => (
					<div key={SIZE_LABELS[index]}>
						<span>{count.toLocaleString(locale)}</span>
						<i style={{ height: `${(count / biggest) * 100}%` }} />
						<small>{SIZE_LABELS[index]}</small>
					</div>
				))}
			</div>
			<p className="mm-con-hint">{t('Median: {size}', { size: formatBytes(worlds.medianBytes, locale) })}</p>
		</Card>
	)
}

/** `/admin/worlds`: what players capture and where, from the metadata the mod already sends. Counts only. */
export function AdminWorlds() {
	const { t, locale } = useI18n()
	const { data } = useConsole()
	const worlds = data.analytics?.worlds
	return (
		<>
			<ConsoleHeader
				title={t('Worlds')}
				lead={t('What players capture, and where. Counts only: no coordinates, seeds or world names.')}
			/>
			{!worlds && <p role="status">{t('Loading the dashboard…')}</p>}
			{worlds && (
				<>
					<section className="mm-con-kpis" aria-label={t('Key figures')}>
						<Kpi
							locale={locale}
							label={t('Captures with a biome')}
							value={percent(shareOf(worlds.withBiome, worlds.captures), locale)}
							note={`${worlds.withBiome.toLocaleString(locale)} / ${worlds.captures.toLocaleString(locale)}`}
						/>
						<Kpi
							locale={locale}
							label={t('On a server')}
							value={percent(shareOf(worlds.onServer, worlds.captures), locale)}
						/>
						<Kpi locale={locale} label={t('Distinct servers')} value={worlds.distinctServers.toLocaleString(locale)} />
						<Kpi locale={locale} label={t('Median capture size')} value={formatBytes(worlds.medianBytes, locale)} />
					</section>
					<div className="mm-con-grid">
						<Ranked
							title={t('Biomes captured')}
							hint={t('The ten most captured')}
							rows={worlds.biomes}
							locale={locale}
						/>
						<Where worlds={worlds} locale={locale} t={t} />
						<Sizes worlds={worlds} locale={locale} t={t} />
					</div>
					{worlds.topServers.length > 0 && (
						<Card title={t('Servers')} hint={t('Only servers captured by at least two accounts are named')}>
							<div className="mm-con-table-wrap">
								<table className="mm-con-table">
									<thead>
										<tr>
											<th>{t('Server')}</th>
											<th className="is-num">{t('Captures')}</th>
											<th className="is-num">{t('Accounts')}</th>
										</tr>
									</thead>
									<tbody>
										{worlds.topServers.map(server => (
											<tr key={server.name}>
												<td>{server.name}</td>
												<td className="is-num">{server.captures.toLocaleString(locale)}</td>
												<td className="is-num">{server.accounts.toLocaleString(locale)}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</Card>
					)}
				</>
			)}
		</>
	)
}
