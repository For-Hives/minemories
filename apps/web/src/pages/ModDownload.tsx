import { Link } from 'react-router'
import { T, useI18n } from '../i18n/I18n'
import { releasesUrl } from './mod-releases'
import { useModReleases } from './useModReleases'

export { selectLatestRelease } from './mod-releases'

export function ModDownload() {
	const { t, locale } = useI18n()

	const { releases, status, retry } = useModReleases()
	const download = releases[0]
	if (status === 'loading')
		return (
			<p role="status">
				<T message={'Checking the download…'} />
			</p>
		)
	return (
		<div className="install-download">
			{download ? (
				<>
					<p>
						<a className="install-primary" href={download.url}>
							<T message={'Download Minemories'} /> {download.version} (.jar)
						</a>
					</p>
					<p>
						Minecraft Java 1.21.1 · NeoForge 21.1.248 ·{' '}
						{download.prerelease ? t('Experimental prerelease.') : t('Published release.')}
					</p>
					<p className="install-caption">
						{(download.bytes / 1048576).toLocaleString(locale, { maximumFractionDigits: 2 })}{' '}
						<T message={'MiB · Download from GitHub Releases.'} />
					</p>
					<p>
						<T message={"Place this file directly in the profile's folder"} /> <code>mods</code>{' '}
						<T message={'. Do not extract it or run it by double-clicking.'} />
					</p>
					{(download.sha256 || download.checksumUrl) && (
						<details>
							<summary>
								<T message={'Verify the downloaded file (advanced)'} />
							</summary>
							{download.sha256 && (
								<p>
									<T message={'SHA-256 checksum:'} /> <code>{download.sha256}</code>
								</p>
							)}
							{download.checksumUrl && (
								<a href={download.checksumUrl}>
									<T message={'Download checksum'} />
								</a>
							)}
						</details>
					)}
				</>
			) : (
				<>
					<p role="status">
						<T
							message={
								"No compatible release is available right now, or GitHub is not responding. Check the project's releases or try again shortly."
							}
						/>
					</p>
					<button type="button" className="install-secondary" onClick={retry}>
						<T message={'Retry download'} />
					</button>
				</>
			)}
			<p>
				<Link to="/versions">
					<T message={"Previous versions and what's new"} />
				</Link>
			</p>
			<p>
				<a href={releasesUrl}>
					<T message={'All releases on GitHub'} />
				</a>
			</p>
		</div>
	)
}
