import { useState } from 'react'
import { Link } from 'react-router'
import { buttonOutline } from '../components/ui'
import { T, useI18n } from '../i18n/I18n'
import { catalogLinks, fabricApiUrl, guideUrl, installerUrl, javaUrl } from './installation-loaders'
import type { System } from './installation-state'
import { ModDownload } from './ModDownload'
import type { LoaderTarget } from './mod-releases'
import { WindowsScreenshot } from './WindowsScreenshot'

export const stepNames = [
	'Prepare',
	'Install the loader',
	'Download the mod',
	'Place the file',
	'Check in game',
	'Create a memory',
]
const folders: Record<System, string> = {
	windows: '%APPDATA%\\.minecraft-minemories',
	mac: '~/Library/Application Support/minecraft-minemories',
	linux: '~/.minecraft-minemories',
}
const exports: Record<System, string> = {
	windows: '%USERPROFILE%\\export',
	mac: '~/export',
	linux: '~/export',
}

export function CopyText({ text, label }: { text: string; label: string }) {
	const { t } = useI18n()
	const [message, setMessage] = useState('')
	return (
		<div className="install-copy">
			<code>{text}</code>
			<button
				type="button"
				className={buttonOutline}
				aria-label={t(label)}
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(text)
						setMessage('Copied!')
					} catch {
						setMessage('Select the text above to copy it.')
					}
				}}
			>
				<T message={'Copy'} />
			</button>
			{message && <span role="status">{t(message)}</span>}
		</div>
	)
}

function PrepareStep({ target }: { target: LoaderTarget }) {
	return (
		<>
			<p>
				<T message={'You need'} />{' '}
				<strong>
					<T message={'Minecraft Java Edition on a computer'} />
				</strong>
				<T message={'. The mod is not available for Bedrock, consoles or mobile devices.'} />
			</p>
			<div className="install-note">
				<strong>
					Minecraft Java Edition {target.minecraft} + {target.name} {target.loaderVersion}
				</strong>
				<p>
					<T
						message={
							'A loader lets the game load mods, and the JAR you download must match it. Every published version, and the Quilt note, are on'
						}
					/>{' '}
					<Link to="/versions">
						<T message={'Mod versions'} />
					</Link>
					<T message={'.'} />
				</p>
			</div>
			<p>
				<T message={'To discover Minemories, start in a'} />{' '}
				<strong>
					<T message={'new test world'} />
				</strong>
				<T
					message={
						'. You can export a capture without an account; to view it on the site, link the mod to your private gallery.'
					}
				/>
			</p>
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
						message={
							'Minemories installs on your computer, not on the server. Check the server rules before capturing.'
						}
					/>
				</p>
			</details>
		</>
	)
}

function LoaderInstaller({
	target,
	system,
	walkthrough,
}: {
	target: LoaderTarget
	system: System
	walkthrough: boolean
}) {
	const { t } = useI18n()
	const fabric = target.loader === 'fabric'
	return (
		<>
			<ol>
				<li>
					<T message={'In Minecraft Launcher, open'} />{' '}
					<strong>
						<T message={'Installations → New installation'} />
					</strong>
					<T message={', choose version'} /> <strong>release {target.minecraft}</strong>{' '}
					<T message={'and launch it once. Close the game and launcher.'} />
					{walkthrough && <WindowsScreenshot id="minecraftVersion" />}
				</li>
				<li>
					<T message={'Install'} />{' '}
					<a href={javaUrl(target)}>
						<T message={'Java {version} (Temurin, official site)'} params={{ version: target.java }} />
					</a>{' '}
					<T
						message={
							"if you do not have it. Choose your system, JDK {version} and your computer's architecture: x64 for Intel/AMD, aarch64 for Apple Silicon. The Java bundled with Minecraft is not always available to open an installer."
						}
						params={{ version: target.java }}
					/>
					{walkthrough && <WindowsScreenshot id="java21" />}
				</li>
				<li>
					<T message={'Download'} />{' '}
					<a href={installerUrl(target)}>
						<T
							message={'the {loader} {version} installer'}
							params={{ loader: target.name, version: target.loaderVersion }}
						/>
					</a>
					<T message={'. Open'} />{' '}
					<em>
						<T message={'this'} />
					</em>{' '}
					{fabric ? (
						<T
							message={
								'file with Java, choose Minecraft {minecraft} and Fabric Loader {version}, then click Install. Wait for the success message.'
							}
							params={{ minecraft: target.minecraft, version: target.loaderVersion }}
						/>
					) : (
						<>
							<T message={'file with Java, select'} /> <strong>Install client</strong>
							<T message={', then confirm. Wait for the success message.'} />
						</>
					)}
					{walkthrough && <WindowsScreenshot id="neoforge" />}
				</li>
				<li>
					<T message={'Reopen Minecraft Launcher. Under'} /> <strong>Installations</strong>
					<T message={', enable display of'} />{' '}
					<strong>
						<T message={'Modded'} />
					</strong>{' '}
					<T message={'versions if necessary. Edit the modded installation created using'} />{' '}
					<strong>
						<T message={'… → Edit → More options'} />
					</strong>
					<T message={'. Check that its version contains'} /> <strong>{target.loaderVersion}</strong>.
				</li>
				<li>
					<T message={'Under'} />{' '}
					<strong>
						<T message={'Game Directory'} />
					</strong>
					<T message={', choose a new folder dedicated to Minemories using'} />{' '}
					<strong>
						<T message={'Browse'} />
					</strong>
					<T message={'. For example:'} />
				</li>
			</ol>
			<CopyText text={folders[system]} label="Copy the suggested game folder" />
			<p className="install-caption">
				{system === 'windows'
					? t("Paste %APPDATA% into File Explorer's address bar, then create the .minecraft-minemories folder.")
					: t(
							'The ~ symbol means your user directory. Create the suggested folder in your file manager, then select it in the launcher.'
						)}
			</p>
			{walkthrough && <WindowsScreenshot id="gameDirectory" />}
			<p>
				<T message={'Save, launch'} />{' '}
				<strong>
					<T message={'this installation'} />
				</strong>
				<T message={'once, then close Minecraft. This creates the folder'} /> <code>mods</code>
				<T
					message={'. If Java or the loader gets stuck, open the help at the bottom of this page before continuing.'}
				/>
			</p>
			<p className="install-caption">
				<a href={guideUrl(target)}>
					<T message={'Official guide for {loader}'} params={{ loader: target.name }} />
				</a>
				<T message={'. The Minecraft Launcher walkthrough still needs in-game validation with the distributed JAR.'} />
			</p>
		</>
	)
}

function OtherLaunchers({ target }: { target: LoaderTarget }) {
	return (
		<details className="install-launchers">
			<summary>
				<T message={'I use CurseForge, Modrinth App or another launcher'} />
			</summary>
			<h4>CurseForge</h4>
			<ol>
				<li>
					<T message={'Open'} /> <a href="https://www.curseforge.com/download/app">CurseForge</a>
					<T message={', choose Minecraft, then'} />{' '}
					<strong>
						<T message={'Create Custom Profile'} />
					</strong>
					.
				</li>
				<li>
					<T message={'Name it Minemories, choose'} /> <strong>Minecraft {target.minecraft}</strong>
					<T message={', type'} /> <strong>{target.name}</strong> <T message={'and version'} />{' '}
					<strong>{target.loaderVersion}</strong>
					<T message={'. For an existing compatible modpack, duplicate its profile instead and keep its mods.'} />
				</li>
			</ol>
			<h4>Modrinth App</h4>
			<ol>
				<li>
					<T message={'Open'} /> <a href="https://modrinth.com/app">Modrinth App</a>{' '}
					<T message={'and sign in to your Minecraft account.'} />
				</li>
				<li>
					<T message={'Create an instance running'} /> <strong>Minecraft {target.minecraft}</strong>{' '}
					<T message={'with'} /> <strong>{target.name}</strong>
					<T message={'. In its settings, select loader'} /> <strong>{target.loaderVersion}</strong>
					<T message={'. For an existing compatible modpack, duplicate its instance and keep its mods.'} />
				</li>
			</ol>
			<h4>Prism Launcher, ATLauncher, GDLauncher, MultiMC</h4>
			<p>
				<T message={'Create a'} /> <strong>Minecraft {target.minecraft}</strong>{' '}
				<T message={'instance and add loader'} />{' '}
				<strong>
					{target.name} {target.loaderVersion}
				</strong>
				<T message={'. Buttons vary between applications.'} />
			</p>
			<p className="install-caption">
				<T
					message={
						'Launch the instance once, then close the game. If your launcher does not offer these exact versions, do not choose a random alternative: use the Minecraft Launcher walkthrough or ask for help.'
					}
				/>
			</p>
		</details>
	)
}

function DownloadStep({ target, walkthrough }: { target: LoaderTarget; walkthrough: boolean }) {
	const catalogs = catalogLinks()
	return (
		<>
			<p>
				{catalogs.length > 0 ? (
					<T
						message={
							'Using the CurseForge or Modrinth app? Install Minemories from its catalog, then go to the next step. Otherwise, download the JAR here.'
						}
					/>
				) : (
					<T
						message={
							'The JAR is the mod file. It is not yet published in the CurseForge and Modrinth catalogs: download it here, then place it in your game’s mods folder.'
						}
					/>
				)}
			</p>
			{catalogs.length > 0 && (
				<p className="install-catalogs">
					{catalogs.map(catalog => (
						<a key={catalog.name} className={buttonOutline} href={catalog.url}>
							{catalog.name}
						</a>
					))}
				</p>
			)}
			<ModDownload target={target} />
			{target.fabricApi && (
				<p className="install-caption">
					<a href={fabricApiUrl(target)}>Fabric API {target.fabricApi}</a>
				</p>
			)}
			{walkthrough && <WindowsScreenshot id="jarDownload" />}
			<p>
				<T
					message={
						'The Minemories JAR is copied into the game. Only the loader installer from the previous step runs with Java.'
					}
				/>
			</p>
		</>
	)
}

function FileStep({ target, screenshots }: { target: LoaderTarget; screenshots: boolean }) {
	const { t } = useI18n()
	return (
		<>
			{catalogLinks().length > 0 && (
				<p className="install-caption">
					<T message={'Installed from CurseForge or Modrinth? The app already placed the file: go to the next step.'} />
				</p>
			)}
			<p>
				<strong>
					<T message={'Close Minecraft completely'} />
				</strong>{' '}
				<T message={'before copying the file.'} />
			</p>
			<ol>
				<li>
					<T
						message={
							'In your launcher, open the folder of the profile configured in step 2: in Minecraft Launcher, click the folder icon of its installation; in CurseForge or Modrinth App, use the folder button or the menu of the profile. Check that this is the dedicated game directory you chose.'
						}
					/>
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
				<strong>　 └─ {target.jarName}</strong>
				{target.fabricApi && <span>　 └─ fabric-api-{target.fabricApi}.jar</span>}
			</fieldset>
			{screenshots && <WindowsScreenshot id="modsFolder" />}
			<p>
				<T message={'The file stays a'} /> <code>.jar</code> <T message={': do not extract it, run it or put it in'} />{' '}
				<code>saves</code>
				<T message={'. There is nothing to install on the server.'} />
			</p>
		</>
	)
}

function VerifyStep({ target, screenshots }: { target: LoaderTarget; screenshots: boolean }) {
	return (
		<>
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
				<p>
					<T message={'The next step also checks that capturing works.'} />
				</p>
			</div>
			{screenshots && (
				<>
					<WindowsScreenshot id="modsList" />
					<WindowsScreenshot id="minemoriesMenu" />
				</>
			)}
			<p>
				<T message={'If M opens something else, go to'} />{' '}
				<strong>
					<T message={'Options → Controls → Key Binds → Minemories'} />
				</strong>{' '}
				<T
					message={'and choose an unused key. You can also find the Minemories button in the pause menu or options.'}
				/>
			</p>
		</>
	)
}

function MemoryStep({ system, screenshots }: { system: System; screenshots: boolean }) {
	const { t } = useI18n()

	return (
		<>
			<p>
				<T message={'For your first attempt, approach a small build and wait for terrain to load. Open chat with'} />{' '}
				<kbd>T</kbd>
				<T message={', paste this command, then press Enter:'} />
			</p>
			<CopyText text="/minemories export 16" label="Copy the first capture command" />
			<p>
				<T
					message={
						'Wait for the export completion message. The number 16 means a radius of 16 blocks: this small capture lets you check the result before capturing a large area.'
					}
				/>
			</p>
			{screenshots && <WindowsScreenshot id="localCapture" />}
			<p>
				<T message={'Open the folder below'} />{' '}
				{system === 'windows'
					? t("by pasting this path into File Explorer's address bar")
					: t('using your file manager (~ means your user directory)')}
				<T message={', then find'} /> <strong>capture.glb</strong> :
			</p>
			<CopyText text={exports[system]} label="Copy the first memory folder" />
			<p>
				<T
					message={
						'To revisit the memory in your browser, link Minecraft to your private gallery, then upload the capture from the mod.'
					}
				/>
			</p>
			{screenshots && <WindowsScreenshot id="viewer" />}
			<div>
				<h4>
					<T message={'Find the memory in my private gallery'} />
				</h4>
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
			</div>
			<p className="install-caption">
				<T message={"The export folder can be changed in the mod's advanced settings."} />{' '}
				<Link to="/fonctionnement">
					<T message={'Learn more about captures and sharing'} />
				</Link>
				.
			</p>
		</>
	)
}

export function InstallationStep({ step, system, target }: { step: number; system: System; target: LoaderTarget }) {
	// The screenshots show the validated walkthrough: Windows, Minecraft Launcher, NeoForge 1.21.1.
	const screenshots = system === 'windows' && target.loader === 'neoforge' && target.minecraft === '1.21.1'
	switch (step) {
		case 0:
			return <PrepareStep target={target} />
		case 1:
			return (
				<>
					<LoaderInstaller target={target} system={system} walkthrough={screenshots} />
					<OtherLaunchers target={target} />
				</>
			)
		case 2:
			return <DownloadStep target={target} walkthrough={screenshots} />
		case 3:
			return <FileStep target={target} screenshots={screenshots} />
		case 4:
			return <VerifyStep target={target} screenshots={screenshots} />
		default:
			return <MemoryStep system={system} screenshots={screenshots} />
	}
}
