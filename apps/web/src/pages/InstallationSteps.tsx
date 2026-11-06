import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { buttonOutline } from '../components/ui'
import { T, useI18n } from '../i18n/I18n'
import { CopyText, exports, folders, InstallerLine, LoaderInstaller, OtherLaunchers } from './InstallationWalkthrough'
import { catalogLinks, fabricApiUrl, javaUrl } from './installation-loaders'
import type { StepId, System } from './installation-state'
import { ModDownload } from './ModDownload'
import type { LoaderTarget } from './mod-releases'
import { WindowsScreenshot } from './WindowsScreenshot'

export const stepTitles: Record<StepId, string> = {
	system: 'Which computer do you play on?',
	minecraft: 'Which Minecraft version do you play?',
	loader: 'Which mod loader do you use?',
	install: 'Install the loader',
	download: 'Download the mod',
	place: 'Place the file',
	verify: 'Check in game',
	memory: 'Create a memory',
}
/** The screens that explain how to install, after the questions. */
export const installStepIds: StepId[] = ['install', 'download', 'place', 'verify', 'memory']

/** One sentence saying what this screen gets you. */
function Goal({ children }: { children: ReactNode }) {
	return <p className="install-goal">{children}</p>
}

/** The Windows screenshots of the validated walkthrough, folded away until asked for. */
function Screenshots({ show, children }: { show: boolean; children: ReactNode }) {
	if (!show) return null
	return (
		<details>
			<summary>
				<T message={'Show the screenshots'} />
			</summary>
			{children}
		</details>
	)
}

function UsualWorld() {
	return (
		<details>
			<summary>
				<T message={'I want to use my usual world or server'} />
			</summary>
			<p>
				<T
					message={
						'Copy the world and profile before making changes. A profile (or instance) groups the game, its mods and settings. Keep all mods required by your world or server. Do not change its version or loader for this tutorial: it must already use the Minecraft version and loader you chose above (Quilt uses the Fabric JAR). Otherwise, ask its administrator for help.'
					}
				/>
			</p>
			<p>
				<T
					message={'Minemories installs on your computer, not on the server. Check the server rules before capturing.'}
				/>
			</p>
		</details>
	)
}

function InstallStep({ target, system, walkthrough }: { target: LoaderTarget; system: System; walkthrough: boolean }) {
	return (
		<>
			<Goal>
				<T message={'Install {loader} so that Minecraft can load mods.'} params={{ loader: target.name }} />
			</Goal>
			<ol>
				<li>
					<T message={'Install'} />{' '}
					<a href={javaUrl(target)}>
						<T message={'Java {version} (Temurin, official site)'} params={{ version: target.java }} />
					</a>
					<T message={', if you do not have it.'} />
				</li>
				<li>
					<InstallerLine target={target} />
				</li>
				<li>
					<T
						message={
							'Give the new profile its own game folder, such as the one below, then launch it once and close the game.'
						}
					/>
				</li>
			</ol>
			<CopyText text={folders[system]} label="Copy the suggested game folder" />
			<details>
				<summary>
					<T message={'Detailed walkthrough with the Minecraft Launcher'} />
				</summary>
				<LoaderInstaller target={target} system={system} walkthrough={walkthrough} />
			</details>
			<OtherLaunchers target={target} />
			<UsualWorld />
		</>
	)
}

function DownloadStep({ target, walkthrough }: { target: LoaderTarget; walkthrough: boolean }) {
	const catalogs = catalogLinks()
	return (
		<>
			<Goal>
				{catalogs.length > 0 ? (
					<T
						message={
							'Using the CurseForge or Modrinth app? Install Minemories from its catalog, then go to the next step. Otherwise, download the JAR here.'
						}
					/>
				) : (
					<T message={'Download the Minemories JAR: the single file that adds the mod to your game.'} />
				)}
			</Goal>
			{catalogs.length > 0 && (
				<p className="install-catalogs">
					{catalogs.map(catalog => (
						<a key={catalog.name} className={buttonOutline} href={catalog.url}>
							{catalog.name}
						</a>
					))}
				</p>
			)}
			<ModDownload target={target} primary={false} />
			{target.fabricApi && (
				<p className="install-caption">
					<a href={fabricApiUrl(target)}>Fabric API {target.fabricApi}</a>
				</p>
			)}
			<details>
				<summary>
					<T message={'Do I run this file?'} />
				</summary>
				<p>
					<T
						message={
							'The Minemories JAR is copied into the game. Only the loader installer from the previous step runs with Java.'
						}
					/>
				</p>
			</details>
			<Screenshots show={walkthrough}>
				<WindowsScreenshot id="jarDownload" />
			</Screenshots>
		</>
	)
}

function FileStep({ target, screenshots }: { target: LoaderTarget; screenshots: boolean }) {
	const { t } = useI18n()
	return (
		<>
			<Goal>
				<strong>
					<T message={'Close Minecraft completely'} />
				</strong>{' '}
				<T message={'before copying the file.'} />
			</Goal>
			{catalogLinks().length > 0 && (
				<p className="install-caption">
					<T message={'Installed from CurseForge or Modrinth? The app already placed the file: go to the next step.'} />
				</p>
			)}
			<ol>
				<li>
					<T message={"Open the profile's folder from your launcher (the folder icon on its installation)."} />
				</li>
				<li>
					<T message={'Open the subfolder'} /> <code>mods</code>
					<T message={'. If it is missing, create a folder named exactly'} /> <code>mods</code>
					<T message={', in lowercase.'} />
				</li>
				<li>
					<T message={'From your'} />{' '}
					<strong>
						<T message={'Downloads'} />
					</strong>
					<T message={', copy the Minemories JAR into'} /> <code>mods</code>
					<T message={'. Keep only one Minemories version: remove its old JAR when updating.'} />
				</li>
			</ol>
			<fieldset className="install-folder" aria-label={t('File location')}>
				<span>
					<T message={'Profile folder'} />
				</span>
				<span>└─ mods</span>
				<strong>　 └─ minemories-{target.id}-X.Y.Z.jar</strong>
				{target.fabricApi && <span>　 └─ fabric-api-{target.fabricApi}.jar</span>}
			</fieldset>
			<details>
				<summary>
					<T message={'I cannot find the profile folder'} />
				</summary>
				<p>
					<T
						message={
							'In your launcher, open the folder of the profile configured in the loader step: in Minecraft Launcher, click the folder icon of its installation; in CurseForge or Modrinth App, use the folder button or the menu of the profile. Check that this is the dedicated game directory you chose.'
						}
					/>
				</p>
				<p>
					<T message={'The file stays a'} /> <code>.jar</code>{' '}
					<T message={': do not extract it, run it or put it in'} /> <code>saves</code>
					<T message={'. There is nothing to install on the server.'} />
				</p>
			</details>
			<Screenshots show={screenshots}>
				<WindowsScreenshot id="modsFolder" />
			</Screenshots>
		</>
	)
}

function VerifyStep({ target, screenshots }: { target: LoaderTarget; screenshots: boolean }) {
	return (
		<>
			<Goal>
				<T message={'Start the game and check that Minemories is there.'} />
			</Goal>
			<ol>
				<li>
					<T message={'Restart Minecraft from the launcher, using the'} />{' '}
					<strong>
						{target.name} {target.loaderVersion}
					</strong>{' '}
					<T message={'profile you just prepared.'} />
				</li>
				<li>
					<T message={'In the game menu, open'} /> <strong>Mods</strong> <T message={'and look for'} />{' '}
					<strong>Minemories</strong>.
				</li>
				<li>
					<T message={'Create a small test world, wait for terrain to load, then press'} /> <kbd>M</kbd>
					<T message={'. The Minemories menu should open.'} />
				</li>
			</ol>
			<div className="install-note">
				<strong>
					<T message={'Can you see the Minemories menu? The installation is recognized.'} />
				</strong>
			</div>
			<details>
				<summary>
					<T message={'M opens another menu, or the command is unknown'} />
				</summary>
				<p>
					<T message={'If M opens something else, go to'} />{' '}
					<strong>
						<T message={'Options → Controls → Key Binds → Minemories'} />
					</strong>{' '}
					<T
						message={'and choose an unused key. You can also find the Minemories button in the pause menu or options.'}
					/>
				</p>
			</details>
			<Screenshots show={screenshots}>
				<WindowsScreenshot id="modsList" />
				<WindowsScreenshot id="minemoriesMenu" />
			</Screenshots>
		</>
	)
}

function GalleryDetails() {
	return (
		<details>
			<summary>
				<T message={'Find the memory in my private gallery'} />
			</summary>
			<p>
				<T
					message={
						'To revisit the memory in your browser, link Minecraft to your private gallery, then upload the capture from the mod.'
					}
				/>
			</p>
			<ol>
				<li>
					<Link to="/register" target="_blank">
						<T message={'Create your account'} />
					</Link>{' '}
					<T message={'or'} />{' '}
					<Link to="/login" target="_blank">
						<T message={'sign in'} />
					</Link>
					<T message={', then open'} />{' '}
					<Link to="/gallery" target="_blank">
						<T message={'My gallery'} />
					</Link>
					.
				</li>
				<li>
					<T
						message={
							'Generate the six-digit pairing code. In Minecraft, press M, type the code and click “Connect”. The code expires after five minutes: generate another if needed.'
						}
					/>
				</li>
				<li>
					<T message={'Click'} />{' '}
					<strong>
						<T message={'Take a memory'} />
					</strong>{' '}
					<T
						message={
							'in the M menu. Once your account is connected, the memory is also sent: wait for confirmation, then check that it appears in the gallery.'
						}
					/>
				</li>
			</ol>
			<p>
				<T
					message={
						'AFK captures are enabled by default after 5 minutes of inactivity, at most once every 4 hours. Once your account is linked, they upload automatically to your private gallery. You can turn them off with “Auto memories” in M. Without a linked account, they stay on your computer.'
					}
				/>
			</p>
		</details>
	)
}

function MemoryStep({ system, screenshots }: { system: System; screenshots: boolean }) {
	const { t } = useI18n()
	return (
		<>
			<Goal>
				<T message={'Capture a small build, then find the file on your computer.'} />
			</Goal>
			<ol>
				<li>
					<T message={'Approach a small build and wait for terrain to load. Open chat with'} /> <kbd>T</kbd>
					<T message={', paste this command, then press Enter:'} />
					<CopyText text="/minemories export 16" label="Copy the first capture command" />
				</li>
				<li>
					<T message={'Open the folder below'} />{' '}
					{system === 'windows'
						? t("by pasting this path into File Explorer's address bar")
						: t('using your file manager (~ means your user directory)')}
					<T message={', then find'} /> <strong>capture.glb</strong> :
					<CopyText text={exports[system]} label="Copy the first memory folder" />
				</li>
			</ol>
			<details>
				<summary>
					<T message={'What does 16 mean?'} />
				</summary>
				<p>
					<T
						message={
							'Wait for the export completion message. The number 16 means a radius of 16 blocks: this small capture lets you check the result before capturing a large area.'
						}
					/>
				</p>
				<p className="install-caption">
					<T message={"The export folder can be changed in the mod's advanced settings."} />
				</p>
			</details>
			<GalleryDetails />
			<Screenshots show={screenshots}>
				<WindowsScreenshot id="localCapture" />
				<WindowsScreenshot id="viewer" />
			</Screenshots>
		</>
	)
}

/** The body of one of the five installation screens; the Windows screenshots show the validated walkthrough only. */
export function InstallationStep({ step, system, target }: { step: StepId; system: System; target: LoaderTarget }) {
	const screenshots = system === 'windows' && target.loader === 'neoforge' && target.minecraft === '1.21.1'
	switch (step) {
		case 'install':
			return <InstallStep target={target} system={system} walkthrough={screenshots} />
		case 'download':
			return <DownloadStep target={target} walkthrough={screenshots} />
		case 'place':
			return <FileStep target={target} screenshots={screenshots} />
		case 'verify':
			return <VerifyStep target={target} screenshots={screenshots} />
		case 'memory':
			return <MemoryStep system={system} screenshots={screenshots} />
		default:
			return null
	}
}
