import { LoadingSkeleton } from '../components/Loading'
import { buttonOutline } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { formatRelativeDate } from '../lib/dates'
import {
	type RoadmapArea,
	type RoadmapColumn,
	type RoadmapColumnId,
	type RoadmapItem,
	roadmapColumns,
	roadmapIssuesUrl,
	roadmapItemDate,
} from '../lib/roadmap'
import { ContentLayout } from './ContentPages'
import { useRoadmap } from './useRoadmap'
import './roadmap.css'

const columnTitles: Record<RoadmapColumnId, string> = {
	inProgress: 'In progress',
	planned: 'Planned',
	done: 'Done',
}
const areaLabels: Record<RoadmapArea, string> = { mod: 'Mod', api: 'API', front: 'Website' }

function RoadmapCard({ item, column, now }: { item: RoadmapItem; column: RoadmapColumnId; now: number }) {
	const { locale, t } = useI18n()
	const date = roadmapItemDate(item, column)
	return (
		<li className="mm-roadmap-card">
			<a href={item.url} target="_blank" rel="noopener noreferrer">
				<span className="mm-roadmap-number">#{item.number}</span> {item.title}
			</a>
			<div className="mm-roadmap-meta">
				{item.areas.length > 0 && (
					<ul className="mm-roadmap-areas" aria-label={t('Project areas')}>
						{item.areas.map(area => (
							<li key={area} className={`mm-roadmap-area mm-roadmap-area-${area}`}>
								{t(areaLabels[area])}
							</li>
						))}
					</ul>
				)}
				<time dateTime={date}>{formatRelativeDate(date, now, locale)}</time>
			</div>
		</li>
	)
}

function RoadmapColumnPanel({ id, column, now }: { id: RoadmapColumnId; column: RoadmapColumn; now: number }) {
	const { t } = useI18n()
	const headingId = `roadmap-${id}`
	return (
		<section className={`mm-roadmap-column mm-roadmap-column-${id}`} aria-labelledby={headingId}>
			<h2 id={headingId}>
				{t(columnTitles[id])} <span className="mm-roadmap-count">{column.items.length + column.more}</span>
			</h2>
			{column.items.length === 0 ? (
				<p className="mm-roadmap-empty">{t('Nothing here right now.')}</p>
			) : (
				<ol className="mm-roadmap-cards">
					{column.items.map(item => (
						<RoadmapCard key={item.number} item={item} column={id} now={now} />
					))}
				</ol>
			)}
			{column.more > 0 && (
				<a className="mm-roadmap-more" href={roadmapIssuesUrl} target="_blank" rel="noopener noreferrer">
					{t('+{count} more on GitHub', { count: column.more })}
				</a>
			)}
		</section>
	)
}

export function RoadmapPage() {
	const { roadmap, status, retry } = useRoadmap()
	const { locale, t } = useI18n()
	const now = Date.now()
	return (
		<ContentLayout
			eyebrow="MINEMORIES · ROADMAP"
			title={t('Roadmap')}
			lead={t(
				'What is being built now, what comes next and what shipped in the last 30 days, straight from the project’s GitHub issues.'
			)}
		>
			<p className="mm-roadmap-note">{t('The same board is posted on the Minemories Discord.')}</p>
			{roadmap && (
				<>
					<p className="mm-roadmap-updated">
						<time dateTime={roadmap.updatedAt}>
							{t('Updated {time}', { time: formatRelativeDate(roadmap.updatedAt, now, locale) })}
						</time>
					</p>
					<div className="mm-roadmap-board" aria-busy={status === 'loading'}>
						{roadmapColumns.map(id => (
							<RoadmapColumnPanel key={id} id={id} column={roadmap.columns[id]} now={now} />
						))}
					</div>
				</>
			)}
			{status === 'loading' && <LoadingSkeleton label={t('Loading the roadmap…')} />}
			{status === 'error' && (
				<div className="mm-roadmap-feedback" role="alert">
					<p>{t('The roadmap could not be loaded. Try again in a moment.')}</p>
					<button type="button" className={buttonOutline} onClick={retry}>
						{t('Retry')}
					</button>
				</div>
			)}
			<p className="mm-roadmap-source">
				<a href={roadmapIssuesUrl} target="_blank" rel="noopener noreferrer">
					{t('Every roadmap issue on GitHub ↗')}
				</a>
			</p>
		</ContentLayout>
	)
}
