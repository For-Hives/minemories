import { Link } from 'react-router'
import { buttonLime } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import type { NotedRelease, ReleaseNote } from '../lib/release-notes'
import { ContentLayout } from './ContentPages'
import { releases as history } from './release-history'
import { useModReleases } from './useModReleases'
import './releases.css'

const noteLabels: Record<ReleaseNote['type'], string> = {
	feature: 'New: {note}',
	fix: 'Fixed: {note}',
	other: 'Changed: {note}',
}
/** Notes on the latest version; an older one shows its first note only. */
const latestNotes = 3

/** One note in the visitor's language when it is translated, otherwise in its English original (marked as such). */
function Note({ note }: { note: ReleaseNote }) {
	const { t, locale } = useI18n()
	const text = t(note.text)
	const untranslated = text === note.text && !locale.startsWith('en')
	return <span lang={untranslated ? 'en' : undefined}>{t(noteLabels[note.type], { note: text })}</span>
}

/** The build date the downloads index gives a version, once loaded; versions the storage no longer keeps have none. */
function ReleaseDate({ published }: { published: number | undefined }) {
	const { locale } = useI18n()
	if (!published) return null
	return (
		<time dateTime={new Date(published).toISOString()}>
			{new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(published)}
		</time>
	)
}

function Latest({ release, published }: { release: NotedRelease; published: number | undefined }) {
	const { t } = useI18n()
	const id = `v${release.version}`
	return (
		<section className="mm-release-card" id={id} aria-labelledby={`${id}-title`}>
			<div className="mm-release-meta">
				<span className="mm-release-badge">{t('Latest version')}</span>
				<ReleaseDate published={published} />
			</div>
			<h2 id={`${id}-title`}>{`Minemories ${release.version}`}</h2>
			<h3>{t('What changes for you')}</h3>
			<ul className="mm-release-notes">
				{release.notes.slice(0, latestNotes).map(note => (
					<li key={note.text}>
						<Note note={note} />
					</li>
				))}
			</ul>
			<Link className={buttonLime} to="/downloads">
				{t('Download')}
			</Link>
		</section>
	)
}

/**
 * /versions: what each mod version changes, in player words, from the curated notes in mod/release-notes (prerendered at
 * build time). The downloads index only adds the dates; the files themselves live on /downloads.
 */
export function ReleasesPage() {
	const { t } = useI18n()
	const { releases } = useModReleases()
	const published = (version: string) => releases.find(release => release.version === version)?.published
	const [latest, ...previous] = history
	return (
		<ContentLayout
			eyebrow={t('MINEMORIES · RELEASES')}
			title={t('What’s new in Minemories')}
			lead={t('Every Minemories version and what it changed, with dates.')}
		>
			{latest && <Latest release={latest} published={published(latest.version)} />}
			{previous.length > 0 && (
				<>
					<h2>{t('Previous versions')}</h2>
					<ol className="mm-release-older">
						{previous.map(release => (
							<li key={release.version} id={`v${release.version}`}>
								<h3>{`Minemories ${release.version}`}</h3>
								<ReleaseDate published={published(release.version)} />
								<p>
									<Note note={release.notes[0] as ReleaseNote} />
								</p>
							</li>
						))}
					</ol>
				</>
			)}
		</ContentLayout>
	)
}
