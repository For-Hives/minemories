import Markdown from 'react-markdown'
import { Link } from 'react-router'
import { buttonLime, buttonOutline } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import type { ModRelease } from './mod-releases'

function Integrity({ release }: { release: ModRelease }) {
	const { t } = useI18n()
	if (!(release.sha256 || release.checksumUrl))
		return <p className="mm-release-muted">{t('SHA-256 checksum not provided.')}</p>
	return (
		<details className="mm-release-integrity">
			<summary>{t('Verify the file (SHA-256)')}</summary>
			{release.sha256 && (
				<p>
					<code>{release.sha256}</code>
				</p>
			)}
			{release.checksumUrl && <a href={release.checksumUrl}>{t('Download checksum')}</a>}
		</details>
	)
}
export function ReleaseCard({
	release,
	recommended,
	changelog,
}: {
	release: ModRelease
	recommended: boolean
	changelog: boolean
}) {
	const { t, locale } = useI18n()
	const id = `v${release.version}`
	return (
		<article
			className={`mm-release-card${recommended ? ' mm-release-recommended' : ''}`}
			id={id}
			aria-labelledby={`${id}-title`}
		>
			<div className="mm-release-meta">
				{recommended && <span className="mm-release-badge">{t('Latest version')}</span>}
				<span className="mm-release-badge mm-release-channel">
					{release.prerelease ? t('Prerelease') : t('Published release')}
				</span>
				<time dateTime={new Date(release.published).toISOString()}>
					{new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(release.published)}
				</time>
			</div>
			<h2 id={`${id}-title`}>
				<a href={`#${id}`}>Minemories {release.version}</a>
			</h2>
			<p>Minecraft Java 1.21.1 · NeoForge 21.1.248 · Java 21</p>
			<div className="mm-release-actions">
				<a className={recommended ? buttonLime : buttonOutline} href={release.url}>
					{t('Download JAR')} <span className="sr-only">{release.version}</span>
					<span aria-hidden="true">↓</span>
				</a>
				<span className="mm-release-muted">
					{(release.bytes / 1048576).toLocaleString(locale, { maximumFractionDigits: 2 })} MiB
				</span>
				{!changelog && <Link to={`/changelog#${id}`}>{t('What’s new →')}</Link>}
			</div>
			<Integrity release={release} />
			{changelog && (
				<details className="mm-release-notes" open={recommended}>
					<summary>
						{t('Release notes')} <span className="sr-only">{release.version}</span>
					</summary>
					<div className="mm-release-markdown">
						{release.notes.trim() ? (
							<Markdown
								skipHtml
								components={{
									h1: ({ children }) => <h3>{children}</h3>,
									h2: ({ children }) => <h3>{children}</h3>,
									h3: ({ children }) => <h4>{children}</h4>,
									img: ({ alt }) => <span>{alt}</span>,
								}}
							>
								{release.notes}
							</Markdown>
						) : (
							<p>{t('No notes published for this release.')}</p>
						)}
					</div>
				</details>
			)}
			<p className="mm-release-source">
				<a href={release.pageUrl}>{t('View release on GitHub')}</a>
			</p>
		</article>
	)
}
