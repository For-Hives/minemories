import { Link } from 'react-router'
import { buttonLime, buttonOutline } from '../components/ui'
import { T, useI18n } from '../i18n/I18n'
import { downloadFor, type LoaderTarget, quiltTestedVersion } from './mod-releases'
import { useModReleases } from './useModReleases'

function QuiltNote({ target }: { target: LoaderTarget }) {
	const { t } = useI18n()
	if (!target.fabricApi) return null
	return (
		<p className="install-caption">
			{t('Install Fabric API separately. This same JAR is also tested under Quilt {version}.', {
				version: quiltTestedVersion,
			})}
		</p>
	)
}

export function ModDownload({ target }: { target: LoaderTarget }) {
	const { t, locale } = useI18n()

	const { releases, status, retry } = useModReleases()
	const release = releases.find(item => downloadFor(item, target.loader, target.minecraft))
	const download = release && downloadFor(release, target.loader, target.minecraft)
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
						<a className={`${buttonLime} install-primary`} href={download.url}>
							<T message={'Download Minemories'} /> {release.version} (.jar)
						</a>
					</p>
					<p>
						Minecraft Java {download.target.minecraft} · {download.target.name} {download.target.loaderVersion}
						{download.target.fabricApi && ` + Fabric API ${download.target.fabricApi}`} · Java {download.target.java} ·{' '}
						{release.prerelease ? t('Experimental prerelease.') : t('Published release.')}
					</p>
					<QuiltNote target={download.target} />
					<p className="install-caption">
						{(download.bytes / 1048576).toLocaleString(locale, { maximumFractionDigits: 2 })}{' '}
						<T message={'MiB · Direct download from Minemories.'} />
					</p>
					<p>
						<T message={"Place this file directly in the profile's folder"} /> <code>mods</code>{' '}
						<T message={'. Do not extract it or run it by double-clicking.'} />
					</p>
					<details>
						<summary>
							<T message={'Verify the downloaded file (advanced)'} />
						</summary>
						<p>
							<T message={'SHA-256 checksum:'} /> <code>{download.sha256}</code>
						</p>
					</details>
				</>
			) : (
				<>
					<p role="status">
						<T
							message={
								'No download is available for this version right now. Try again shortly or open the versions page.'
							}
						/>
					</p>
					<button type="button" className={`${buttonOutline} install-secondary`} onClick={retry}>
						<T message={'Retry download'} />
					</button>
				</>
			)}
			<p>
				<Link to="/versions">
					<T message={"Previous versions and what's new"} />
				</Link>
			</p>
		</div>
	)
}
