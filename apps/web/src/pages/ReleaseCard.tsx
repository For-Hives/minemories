import Markdown from 'react-markdown'
import { Link } from 'react-router'
import { buttonLime, buttonOutline } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { type LoaderDownload, type LoaderTarget, type ModRelease, quiltTestedVersion } from './mod-releases'

function Integrity({ download }: { download: LoaderDownload }) {
	const { t } = useI18n()
	if (!(download.sha256 || download.checksumUrl))
		return <p className="mm-release-muted">{t('SHA-256 checksum not provided.')}</p>
	return (
		<details className="mm-release-integrity">
			<summary>{t('Verify the file (SHA-256)')}</summary>
			{download.sha256 && (
				<p>
					<code>{download.sha256}</code>
				</p>
			)}
			{download.checksumUrl && <a href={download.checksumUrl}>{t('Download checksum')}</a>}
		</details>
	)
}
function compatibility(target: LoaderTarget) {
	const loader = target.fabricApi
		? `${target.name} Loader ${target.loaderVersion} + Fabric API ${target.fabricApi}`
		: `${target.name} ${target.loaderVersion}`
	return `Minecraft Java ${target.minecraft} · ${loader} · Java ${target.java}`
}
function Download({
	download,
	version,
	recommended,
}: {
	download: LoaderDownload
	version: string
	recommended: boolean
}) {
	const { t, locale } = useI18n()
	const { target } = download
	return (
		<li className="mm-release-download">
			<h3>{target.name}</h3>
			<p>{compatibility(target)}</p>
			{target.fabricApi && (
				<p className="mm-release-muted">
					{t('Install Fabric API separately. This same JAR is also tested under Quilt {version}.', {
						version: quiltTestedVersion,
					})}
				</p>
			)}
			<div className="mm-release-actions">
				<a className={recommended ? buttonLime : buttonOutline} href={download.url}>
					{t('Download {loader} JAR', { loader: target.name })} <span className="sr-only">{version}</span>
					<span aria-hidden="true">↓</span>
				</a>
				<span className="mm-release-muted">
					{(download.bytes / 1048576).toLocaleString(locale, { maximumFractionDigits: 2 })} MiB
				</span>
			</div>
			<Integrity download={download} />
		</li>
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
			<ul className="mm-release-downloads" aria-label={t('Files for each loader')}>
				{release.downloads.map(download => (
					<Download
						key={download.target.loader}
						download={download}
						version={release.version}
						recommended={recommended}
					/>
				))}
			</ul>
			{!changelog && (
				<p>
					<Link to={`/changelog#${id}`}>{t('What’s new →')}</Link>
				</p>
			)}
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
