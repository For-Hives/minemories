import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { buttonOutline } from '../components/ui'
import { T, useI18n } from '../i18n/I18n'
import { GameScreenshot } from './GameScreenshot'
import { CopyText, exports, folders, InstallerLine, LoaderInstaller, OtherLaunchers } from './InstallationWalkthrough'
import { catalogLinks, fabricApiUrl, javaUrl } from './installation-loaders'
import type { StepId, System } from './installation-state'
import { ModDownload } from './ModDownload'
import type { LoaderTarget } from './mod-releases'
import { hasWindowsScreenshot, WindowsScreenshot, type WindowsScreenshotId } from './WindowsScreenshot'

export const stepTitles: Record<StepId, string> = {
	system: 'Which computer do you play on?',
	minecraft: 'Which Minecraft version do you play?',
	loader: 'Which mod loader do you use?',
	install: 'Install the loader',
	download: 'Download the mod',
	place: 'Place the file',
	verify: 'Launch the game',
	memory: 'Create a memory',
}
/** The screens that explain how to install, after the questions. */
export const installStepIds: StepId[] = ['install', 'download', 'place', 'verify', 'memory']

/** One sentence saying what this screen gets you. */
function Goal({ children }: { children: ReactNode }) {
	return <p className="install-goal">{children}</p>
}

/** The Windows screenshots of the validated walkthrough, folded away until asked for; no fold while none has an image. */
function Screenshots({ show, ids }: { show: boolean; ids: WindowsScreenshotId[] }) {
	if (!(show && hasWindowsScreenshot(ids))) return null
	return (
		<details>
			<summary>
				<T message={'Show the screenshots'} />
			</summary>
			{ids.map(id => (
				<WindowsScreenshot key={id} id={id} />
			))}
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
							'Using the CurseForge app? Install Minemories from it, then go to the next step. Otherwise, download the JAR here.'
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
			<Screenshots show={walkthrough} ids={['jarDownload']} />
		</>
	)
}

/** The mods folder of the default game directory, or of the dedicated one the guide had a new loader use. */
const defaultMods: Record<System, string> = {
	windows: '%APPDATA%\\.minecraft\\mods',
	mac: '~/Library/Application Support/minecraft/mods',
	linux: '~/.minecraft/mods',
}
const dedicatedMods: Record<System, string> = {
	windows: `${folders.windows}\\mods`,
	mac: `${folders.mac}/mods`,
	linux: `${folders.linux}/mods`,
}
const modsSuffix = /[\\/]mods$/
const openFolder: Record<System, string> = {
	windows: 'Press Windows + R, paste this path, then press Enter.',
	mac: 'In Finder, choose Go → Go to Folder (Shift + Cmd + G), paste this path, then press Enter.',
	linux: 'In your file manager, press Ctrl + L, paste this path, then press Enter.',
}

function FileStep({
	target,
	system,
	needsLoader,
	screenshots,
}: {
	target: LoaderTarget
	system: System
	needsLoader: boolean
	screenshots: boolean
}) {
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
					<T message={'Installed from the CurseForge app? It already placed the file: go to the next step.'} />
				</p>
			)}
			<ol>
				<li>
					{needsLoader ? (
						<T message={'Open the mods folder of the profile you just created:'} />
					) : (
						<T message={'Open the mods folder. With the official Minecraft Launcher, it is here by default:'} />
					)}
					<CopyText text={(needsLoader ? dedicatedMods : defaultMods)[system]} label="Copy the mods folder path" />
					<span className="install-caption">{t(openFolder[system])}</span>
				</li>
				<li>
					<T message={'If the folder does not exist, create a folder named exactly'} /> <code>mods</code>
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
				<span>{needsLoader ? folders[system] : defaultMods[system].replace(modsSuffix, '')}</span>
				<span>└─ mods</span>
				<strong>　 └─ minemories-{target.id}-X.Y.Z.jar</strong>
				{target.fabricApi && <span>　 └─ fabric-api-{target.fabricApi}.jar</span>}
			</fieldset>
			<details>
				<summary>
					<T message={'I use CurseForge, Modrinth App or another launcher'} />
				</summary>
				<p>
					<T
						message={
							'Each profile there has its own folder. Open the profile, use its folder button or its menu (Open folder), then open mods inside it.'
						}
					/>
				</p>
				<p>
					<T message={'The file stays a'} /> <code>.jar</code>{' '}
					<T message={': do not extract it, run it or put it in'} /> <code>saves</code>
					<T message={'. There is nothing to install on the server.'} />
				</p>
			</details>
			<Screenshots show={screenshots} ids={['modsFolder']} />
		</>
	)
}

function VerifyStep({ target }: { target: LoaderTarget }) {
	return (
		<>
			<Goal>
				<T message={'Launch Minecraft and check that Minemories is there.'} />
			</Goal>
			<ol>
				<li>
					<T message={'In your launcher, choose the'} /> <strong>{target.name}</strong>{' '}
					<T message={'profile, then click Play.'} />
				</li>
				<li>
					<T message={'Open a world, or create a small test world, and wait for the terrain to load.'} />
				</li>
				<li>
					<T message={'Press'} /> <kbd>Esc</kbd>
					<T message={': a Minemories button appears in the top-right corner of the pause menu.'} />
				</li>
			</ol>
			<GameScreenshot id="pauseMenu" />
			<div className="install-note">
				<strong>
					<T message={'You can see the Minemories button? The mod is installed.'} />
				</strong>{' '}
				<T message={'In game, the'} /> <kbd>M</kbd> <T message={'key opens the same menu.'} />
			</div>
			<details>
				<summary>
					<T message={'No Minemories button, or M opens another menu'} />
				</summary>
				<p>
					<T
						message={
							'No button: check that the profile launched is the one whose mods folder holds the JAR, and that it uses the version and loader you chose.'
						}
					/>
				</p>
				<p>
					<T message={'With other mods, the button can sit in another corner of the pause menu.'} />
				</p>
				<p>
					<T message={'If M opens something else, go to'} />{' '}
					<strong>
						<T message={'Options → Controls → Key Binds → Minemories'} />
					</strong>{' '}
					<T message={'and choose an unused key.'} />
				</p>
			</details>
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

function ExportCommand() {
	return (
		<dl className="install-command-parts">
			<dt>
				<code>/minemories</code>
			</dt>
			<dd>
				<T message={'The commands of the mod.'} />
			</dd>
			<dt>
				<code>export</code>
			</dt>
			<dd>
				<T message={'Captures now and saves a .glb file on this computer. Nothing is sent.'} />
			</dd>
			<dt>
				<code>16</code>
			</dt>
			<dd>
				<T
					message={
						'The radius in blocks around you, from 2 to 128. Small is quick: good for a first try. Larger takes longer and makes a bigger file.'
					}
				/>
			</dd>
			<dt>
				<code>selection</code>
			</dt>
			<dd>
				<T message={'Instead of a number: captures the box you marked with'} /> <code>/minemories select first</code>{' '}
				<T message={'and'} /> <code>/minemories select second</code>.
			</dd>
		</dl>
	)
}

function MemoryStep({ system, screenshots }: { system: System; screenshots: boolean }) {
	const { t } = useI18n()
	return (
		<>
			<Goal>
				<T message={'Stand near a small build. There are two ways to capture it: the menu, or a command.'} />
			</Goal>
			<h3 className="install-method">
				<T message={'With the menu'} />
			</h3>
			<ol>
				<li>
					<T message={'Press'} /> <kbd>M</kbd> <T message={'(or Esc, then the Minemories button).'} />
				</li>
				<li>
					<T message={'Click'} />{' '}
					<strong>
						<T message={'Take a memory'} />
					</strong>
					<T
						message={'. It captures 32 blocks around you. Without a linked account, the memory stays on this computer.'}
					/>
				</li>
			</ol>
			<GameScreenshot id="minemoriesMenu" />
			<h3 className="install-method">
				<T message={'With a command'} />
			</h3>
			<p>
				<T message={'Use it to choose the size of the capture. Open chat with'} /> <kbd>T</kbd>
				<T message={', paste this command, then press Enter:'} />
			</p>
			<CopyText text="/minemories export 16" label="Copy the first capture command" />
			<GameScreenshot id="exportCommand" />
			<ExportCommand />
			<h3 className="install-method">
				<T message={'Find the file'} />
			</h3>
			<p>
				<T message={'Wait for the end-of-export message, then open the folder below'} />{' '}
				{system === 'windows'
					? t("by pasting this path into File Explorer's address bar")
					: t('using your file manager (~ means your user directory)')}
				<T message={', then find'} /> <strong>capture.glb</strong> :
			</p>
			<CopyText text={exports[system]} label="Copy the first memory folder" />
			<p className="install-caption">
				<T message={"The export folder can be changed in the mod's advanced settings."} />
			</p>
			<GalleryDetails />
			<Screenshots show={screenshots} ids={['viewer']} />
		</>
	)
}

/** The body of one of the five installation screens; the Windows screenshots show the validated walkthrough only. */
export function InstallationStep({
	step,
	system,
	target,
	needsLoader = false,
}: {
	step: StepId
	system: System
	target: LoaderTarget
	/** The visitor installs a new loader in a dedicated game folder (and the place step points there). */
	needsLoader?: boolean
}) {
	const screenshots = system === 'windows' && target.loader === 'neoforge' && target.minecraft === '1.21.1'
	switch (step) {
		case 'install':
			return <InstallStep target={target} system={system} walkthrough={screenshots} />
		case 'download':
			return <DownloadStep target={target} walkthrough={screenshots} />
		case 'place':
			return <FileStep target={target} system={system} needsLoader={needsLoader} screenshots={screenshots} />
		case 'verify':
			return <VerifyStep target={target} />
		case 'memory':
			return <MemoryStep system={system} screenshots={screenshots} />
		default:
			return null
	}
}
