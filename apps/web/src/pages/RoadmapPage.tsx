import { Link } from 'react-router'
import { LoadingSkeleton } from '../components/Loading'
import { buttonOutline } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { formatRelativeDate } from '../lib/dates'
import {
	type LatestRelease,
	pullRequestUrl,
	type ReleaseNoteType,
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
const areaLabels: Record<RoadmapArea, string> = { mod: 'Mod', api: 'API', front: 'Website', socials: 'Socials' }
const noteLabels: Record<ReleaseNoteType, string> = { feature: 'New', fix: 'Fixed', other: 'Changed' }

/** The newest mod version above the board: its tag, date and what changed in mod/ since the previous tag. */
function LatestReleaseCard({ release }: { release: LatestRelease }) {
	const { locale, t } = useI18n()
	const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(release.date))
	return (
		<article className="mm-roadmap-release" aria-labelledby="roadmap-latest-release">
			<h2 id="roadmap-latest-release">{t('Latest mod version')}</h2>
			<p className="mm-roadmap-release-head">
				<span className="mm-roadmap-release-version">{release.version}</span>
				{release.prerelease && <span className="mm-roadmap-release-beta">{t('Beta')}</span>}
				<time dateTime={release.date}>{t('Released {date}', { date })}</time>
			</p>
			{release.notes.length > 0 && (
				<ul className="mm-roadmap-release-notes" aria-label={t('Changes in this version')}>
					{release.notes.map((note, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: notes have no id and two commits can share a subject.
						<li key={index}>
							<span className={`mm-roadmap-release-type mm-roadmap-release-type-${note.type}`}>
								{t(noteLabels[note.type])}
							</span>{' '}
							{note.text}
							{note.pr !== null && (
								<>
									{' '}
									<a href={pullRequestUrl(note.pr)} target="_blank" rel="noopener noreferrer">
										#{note.pr}
									</a>
								</>
							)}
						</li>
					))}
				</ul>
			)}
			{release.more > 0 && (
				<p className="mm-roadmap-release-more">{t('+{count} more changes', { count: release.more })}</p>
			)}
			<p className="mm-roadmap-release-links">
				<Link to="/downloads">{t('Download')}</Link>
				<Link to="/versions">{t('All changes')}</Link>
				<a href={release.compareUrl} target="_blank" rel="noopener noreferrer">
					{t('Compare on GitHub ↗')}
				</a>
			</p>
		</article>
	)
}

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
			eyebrow={t('MINEMORIES · ROADMAP')}
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
					{roadmap.latestRelease && <LatestReleaseCard release={roadmap.latestRelease} />}
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
