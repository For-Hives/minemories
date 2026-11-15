import { buttonOutline } from '../../components/ui'
import { useI18n } from '../../i18n/I18n'
import { Group } from './AdminKit'
import { PERIODS, type Period, useConsole } from './console'

/** Title, one-line purpose and the tools every page shares: the period, its comparison and a refresh, with the time of the last load. */
export function ConsoleHeader({
	title,
	lead,
	periodTools = false,
}: {
	title: string
	lead: string
	periodTools?: boolean
}) {
	const { t, locale } = useI18n()
	const { period, setPeriod, compare, setCompare, reload, data, openPalette } = useConsole()
	const labels: Record<Period, string> = { '24h': t('24 hours'), '7d': t('7 days'), '30d': t('30 days') }
	return (
		<header className="mm-con-bar">
			<div>
				<h1>{title}</h1>
				<p className="mm-con-sub">{lead}</p>
			</div>
			<div className="mm-con-tools">
				{periodTools && (
					<>
						<Group className="mm-con-seg" label={t('Period')}>
							{PERIODS.map(value => (
								<button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>
									{labels[value]}
								</button>
							))}
						</Group>
						<button type="button" className="mm-con-chip" aria-pressed={compare} onClick={() => setCompare(!compare)}>
							{t('Compare with the previous period')}
						</button>
					</>
				)}
				<button type="button" className="mm-con-chip" onClick={openPalette}>
					{t('Jump to…')} <kbd>Ctrl K</kbd>
				</button>
				<button type="button" className={buttonOutline} disabled={data.loading} onClick={reload}>
					{t('Refresh')}
				</button>
				{data.updatedAt !== null && (
					<span className="mm-con-live">
						{t('Updated {time}', {
							time: new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(data.updatedAt),
						})}
					</span>
				)}
			</div>
		</header>
	)
}
