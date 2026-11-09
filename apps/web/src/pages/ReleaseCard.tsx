import { buttonLime, buttonOutline } from '../components/ui'
import { useI18n } from '../i18n/I18n'
import { type LoaderDownload, type LoaderTarget, type ModRelease, quiltTestedVersion } from './mod-releases'

function Integrity({ download }: { download: LoaderDownload }) {
	const { t } = useI18n()
	return (
		<details className="mm-release-integrity">
			<summary>{t('Verify the file (SHA-256)')}</summary>
			<p>
				<code>{download.sha256}</code>
			</p>
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
export function ReleaseCard({ release, recommended }: { release: ModRelease; recommended: boolean }) {
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
				{release.downloads.map((download, index) => (
					<Download
						key={download.target.id}
						download={download}
						version={release.version}
						recommended={recommended && index === 0}
					/>
				))}
			</ul>
			{release.commitUrl && (
				<p className="mm-release-source">
					<a href={release.commitUrl}>{t('View the build commit on GitHub')}</a>
				</p>
			)}
		</article>
	)
}
