import { Link } from 'react-router'
import { T, useI18n } from '../i18n/I18n'
import { downloadFor, releasesUrl } from './mod-releases'
import { useModReleases } from './useModReleases'

export { selectLatestRelease } from './mod-releases'

export function ModDownload() {
	const { t, locale } = useI18n()

	const { releases, status, retry } = useModReleases()
	// The installation guide only covers NeoForge: offer the newest release that ships its JAR.
	const release = releases.find(item => downloadFor(item, 'neoforge'))
	const download = release && downloadFor(release, 'neoforge')
	if (status === 'loading')
		return (
			<p role="status">
				<T message={'Checking the download…'} />
			</p>
		)
	return (
		<div className="install-download">
			{release && download ? (
				<>
					<p>
						<a className="install-primary" href={download.url}>
							<T message={'Download Minemories'} /> {release.version} (.jar)
						</a>
					</p>
					<p>
						Minecraft Java {download.target.minecraft} · NeoForge {download.target.loaderVersion} ·{' '}
						{release.prerelease ? t('Experimental prerelease.') : t('Published release.')}
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
					<T message={'Playing with Fabric, Forge or Quilt? Get the matching JAR on the mod versions page.'} />
				</Link>
			</p>
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
