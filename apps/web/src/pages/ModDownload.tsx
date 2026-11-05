import { useState } from 'react'
import { Link } from 'react-router'
import { buttonLime, buttonOutline } from '../components/ui'
import { T, useI18n } from '../i18n/I18n'
import {
	downloadFor,
	type LoaderTarget,
	loaderTargets,
	minecraftVersions,
	quiltTestedVersion,
	releasesUrl,
} from './mod-releases'
import { useModReleases } from './useModReleases'

export { selectLatestRelease } from './mod-releases'

const guideMinecraft = '1.21.1'
const guideLoader = 'neoforge'

function VersionPicker({
	minecraft,
	loader,
	loaders,
	onMinecraft,
	onLoader,
}: {
	minecraft: string
	loader: string
	loaders: LoaderTarget[]
	onMinecraft: (value: string) => void
	onLoader: (value: string) => void
}) {
	return (
		<fieldset className="install-picker">
			<label>
				<T message={'Minecraft version'} />
				<span className="mc-select">
					<select className="mc-select__control" value={minecraft} onChange={event => onMinecraft(event.target.value)}>
						{minecraftVersions().map(version => (
							<option key={version} value={version}>
								{version}
							</option>
						))}
					</select>
				</span>
			</label>
			<label>
				<T message={'Mod loader'} />
				<span className="mc-select">
					<select className="mc-select__control" value={loader} onChange={event => onLoader(event.target.value)}>
						{loaders.map(target => (
							<option key={target.loader} value={target.loader}>
								{target.name}
							</option>
						))}
					</select>
				</span>
			</label>
		</fieldset>
	)
}

function CompatibilityNotes({ target, guideStep }: { target: LoaderTarget; guideStep: boolean }) {
	const { t } = useI18n()
	return (
		<>
			{target.fabricApi && (
				<p className="install-caption">
					{t('Install Fabric API separately. This same JAR is also tested under Quilt {version}.', {
						version: quiltTestedVersion,
					})}
				</p>
			)}
			{!guideStep && (
				<p className="install-caption">
					<T
						message={
							'The steps below detail Minecraft 1.21.1 with NeoForge. For another version, install the matching loader, then place this JAR in the mods folder.'
						}
					/>
				</p>
			)}
		</>
	)
}

export function ModDownload() {
	const { t, locale } = useI18n()

	const { releases, status, retry } = useModReleases()
	// The written steps detail NeoForge 1.21.1, so it is the default choice.
	const [minecraft, setMinecraft] = useState(guideMinecraft)
	const [chosenLoader, setLoader] = useState(guideLoader)
	const loaders = loaderTargets.filter(target => target.minecraft === minecraft)
	const loader = loaders.some(target => target.loader === chosenLoader) ? chosenLoader : (loaders[0]?.loader ?? '')
	const release = releases.find(item => downloadFor(item, loader, minecraft))
	const download = release && downloadFor(release, loader, minecraft)
	if (status === 'loading')
		return (
			<p role="status">
				<T message={'Checking the download…'} />
			</p>
		)
	return (
		<div className="install-download">
			<VersionPicker
				minecraft={minecraft}
				loader={loader}
				loaders={loaders}
				onMinecraft={setMinecraft}
				onLoader={setLoader}
			/>
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
					<CompatibilityNotes
						target={download.target}
						guideStep={minecraft === guideMinecraft && loader === guideLoader}
					/>
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
					<button type="button" className={`${buttonOutline} install-secondary`} onClick={retry}>
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
