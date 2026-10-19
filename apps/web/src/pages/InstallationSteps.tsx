import { useState } from 'react'
import { Link } from 'react-router'
import { T, useI18n } from '../i18n/I18n'
import type { Launcher, System } from './installation-state'
import { ModDownload } from './ModDownload'
import { WindowsScreenshot } from './WindowsScreenshot'

export const stepNames = [
	'Prepare',
	'Install NeoForge',
	'Download the mod',
	'Place the file',
	'Check in game',
	'Create a memory',
]
export const launcherNames: Record<Launcher, string> = {
	manuel: 'Minecraft Launcher',
	curseforge: 'CurseForge',
	modrinth: 'Modrinth App',
	autre: 'Another launcher',
}
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

function PrepareStep() {
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
				<strong>Minecraft Java Edition 1.21.1 + NeoForge 21.1.248</strong>
				<p>
					<T
						message={
							'This guide covers NeoForge, which lets the game load the mod. Other validated versions are listed under'
						}
					/>{' '}
					<Link to="/versions">
						<T message={'Mod versions'} />
					</Link>
					.
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
							'Copy the world and profile before making changes. A profile (or instance) groups the game, its mods and settings. Keep all mods required by your world or server. Do not change its version or loader for this tutorial: if it does not already use Java 1.21.1 and NeoForge 21.1.248, ask its administrator for help.'
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

function ManualLoader({ system }: { system: System }) {
	const { t } = useI18n()

	return (
		<>
			<ol>
				<li>
					<T message={'In Minecraft Launcher, open'} />{' '}
					<strong>
						<T message={'Installations → New installation'} />
					</strong>
					<T message={', choose version'} /> <strong>release 1.21.1</strong>{' '}
					<T message={'and launch it once. Close the game and launcher.'} />
					{system === 'windows' && <WindowsScreenshot id="minecraftVersion" />}
				</li>
				<li>
					<T message={'Install'} />{' '}
					<a href="https://adoptium.net/temurin/releases/?version=21">
						<T message={'Java 21 (Temurin, official site)'} />
					</a>{' '}
					<T
						message={
							"if you do not have it. Choose your system, JDK 21 and your computer's architecture: x64 for Intel/AMD, aarch64 for Apple Silicon. The Java bundled with Minecraft is not always available to open an installer."
						}
					/>
					{system === 'windows' && <WindowsScreenshot id="java21" />}
				</li>
				<li>
					<T message={'Download'} />{' '}
					<a href="https://maven.neoforged.net/releases/net/neoforged/neoforge/21.1.248/neoforge-21.1.248-installer.jar">
						<T message={'the NeoForge 21.1.248 installer'} />
					</a>
					<T message={'. Open'} />{' '}
					<em>
						<T message={'this'} />
					</em>{' '}
					<T message={'file with Java, select'} /> <strong>Install client</strong>
					<T message={', then confirm. Wait for the success message.'} />
					{system === 'windows' && <WindowsScreenshot id="neoforge" />}
				</li>
				<li>
					<T message={'Reopen Minecraft Launcher. Under'} /> <strong>Installations</strong>
					<T message={', enable display of'} />{' '}
					<strong>
						<T message={'Modded'} />
					</strong>{' '}
					<T message={'versions if necessary. Edit the NeoForge installation created using'} />{' '}
					<strong>
						<T message={'… → Edit → More options'} />
					</strong>
					<T message={'. Check that its version contains'} /> <strong>21.1.248</strong>.
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
			{system === 'windows' && <WindowsScreenshot id="gameDirectory" />}
			<p>
				<T message={'Save, launch'} />{' '}
				<strong>
					<T message={'this NeoForge installation'} />
				</strong>
				<T message={'once, then close Minecraft. This creates the folder'} /> <code>mods</code>
				<T message={'. If Java or NeoForge gets stuck, open the help at the bottom of this page before continuing.'} />
			</p>
			<p className="install-caption">
				<a href="https://docs.neoforged.net/user/docs/">
					<T message={'Official Java and NeoForge guide'} />
				</a>
				<T message={'. The Minecraft Launcher walkthrough still needs in-game validation with the distributed JAR.'} />
			</p>
		</>
	)
}

function LauncherLoader({ launcher }: { launcher: Exclude<Launcher, 'manuel'> }) {
	if (launcher === 'autre')
		return (
			<>
				<p>
					<T message={'In Prism Launcher, ATLauncher, GDLauncher or MultiMC, create a'} />{' '}
					<strong>Minecraft 1.21.1</strong> <T message={'instance and add loader'} /> <strong>NeoForge 21.1.248</strong>
					<T message={'. Buttons vary between applications.'} />
				</p>
				<p>
					<T
						message={
							'For an existing world, copy its compatible instance and keep its mods. If your launcher does not offer these exact versions, do not choose a random alternative: use the Minecraft Launcher walkthrough or ask for help.'
						}
					/>
				</p>
				<p>
					<T
						message={'Launch this instance once, then close the game. This walkthrough still needs in-game validation.'}
					/>
				</p>
			</>
		)
	if (launcher === 'curseforge')
		return (
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
					<T message={'Name it Minemories, choose'} /> <strong>Minecraft 1.21.1</strong>
					<T message={', type'} /> <strong>NeoForge</strong> <T message={'and version'} /> <strong>21.1.248</strong>
					<T message={'. For an existing compatible modpack, duplicate its profile instead and keep its mods.'} />
				</li>
				<li>
					<T
						message={
							'Launch the profile once, then close the game. If the copied profile is locked, allow editing in its options.'
						}
					/>
				</li>
			</ol>
		)
	return (
		<>
			<ol>
				<li>
					<T message={'Open'} /> <a href="https://modrinth.com/app">Modrinth App</a>{' '}
					<T message={'and sign in to your Minecraft account.'} />
				</li>
				<li>
					<T message={'Create an instance running'} /> <strong>Minecraft 1.21.1</strong> <T message={'with'} />{' '}
					<strong>NeoForge</strong>
					<T message={'. In its settings, select loader'} /> <strong>21.1.248</strong>
					<T message={'. For an existing compatible modpack, duplicate its instance and keep its mods.'} />
				</li>
				<li>
					<T message={'Launch this instance once, then close the game.'} />
				</li>
			</ol>
			<p className="install-caption">
				<T message={'This local-file walkthrough still needs in-game validation.'} />{' '}
				<a href="https://support.modrinth.com/en/collections/7804910-modrinth-app">
					<T message={'Official Modrinth App help'} />
				</a>
				.
			</p>
		</>
	)
}

function FileStep({ launcher, screenshots }: { launcher: Launcher; screenshots: boolean }) {
	const { t } = useI18n()

	let instruction = (
		<>
			<T
				message={'In Minecraft Launcher → Installations, find the NeoForge profile configured in step 2 and click its'}
			/>{' '}
			<strong>
				<T message={'folder icon'} />
			</strong>
			<T message={'. Check that this is the dedicated game directory you chose.'} />
		</>
	)
	if (launcher === 'curseforge')
		instruction = (
			<>
				<T message={'In CurseForge, open the'} /> <strong>…</strong>{' '}
				<T message={'menu of the Minemories profile, then'} />{' '}
				<strong>
					<T message={'Open Folder'} />
				</strong>
				.
			</>
		)
	if (launcher === 'modrinth')
		instruction = (
			<>
				<T message={'In Modrinth App, open the Minemories instance folder using its'} />{' '}
				<strong>
					<T message={'folder icon'} />
				</strong>{' '}
				<T message={'or its menu.'} />
			</>
		)
	if (launcher === 'autre')
		instruction = (
			<>
				<T message={'In your launcher, open the'} />{' '}
				<strong>
					<T message={'instance folder'} />
				</strong>{' '}
				<T message={"of your chosen NeoForge 21.1.248 instance. Use that instance's folder button or menu."} />
			</>
		)
	return (
		<>
			<p>
				<strong>
					<T message={'Close Minecraft completely'} />
				</strong>{' '}
				<T message={'before copying the file.'} />
			</p>
			<ol>
				<li>{instruction}</li>
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
					<T message={'NeoForge profile folder'} />
				</span>
				<span>└─ mods</span>
				<strong>　 └─ minemories-neoforge-mc1.21.1.jar</strong>
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

function VerifyStep({ launcher, screenshots }: { launcher: Launcher; screenshots: boolean }) {
	const { t } = useI18n()
	return (
		<>
			<ol>
				<li>
					<T message={'Restart Minecraft from'} /> <strong>{t(launcherNames[launcher])}</strong>
					<T message={', using the'} /> <strong>NeoForge 21.1.248</strong> <T message={'profile you just prepared.'} />
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
								'Generate the six-digit pairing code. In Minecraft, press M, enter the code and connect your account. The code expires after five minutes: generate another if needed.'
							}
						/>
					</li>
					<li>
						<T message={'Click'} />{' '}
						<strong>
							<T message={'Capture and upload'} />
						</strong>{' '}
						<T message={'in the M menu. Wait for confirmation, then check that the capture appears in the gallery.'} />
					</li>
				</ol>
				<p>
					<T
						message={
							'AFK captures are enabled by default after 5 minutes of inactivity, at most once every 4 hours. Once your account is linked, they upload automatically to your private gallery. You can disable them in M. Without a linked account, they stay on your computer.'
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

export function InstallationStep({ step, system, launcher }: { step: number; system: System; launcher: Launcher }) {
	const screenshots = system === 'windows' && launcher === 'manuel'
	switch (step) {
		case 0:
			return <PrepareStep />
		case 1:
			return launcher === 'manuel' ? <ManualLoader system={system} /> : <LauncherLoader launcher={launcher} />
		case 2:
			return (
				<>
					<p>
						<T
							message={
								'The JAR is the mod file. Download it here, from the site; it is not yet published in the CurseForge and Modrinth catalogs. Even with these applications, you add the file manually.'
							}
						/>
					</p>
					<ModDownload />
					{screenshots && <WindowsScreenshot id="jarDownload" />}
					<p>
						<T
							message={
								'The Minemories JAR is copied into the game. Only the NeoForge installer from the previous step runs with Java.'
							}
						/>
					</p>
				</>
			)
		case 3:
			return <FileStep launcher={launcher} screenshots={screenshots} />
		case 4:
			return <VerifyStep launcher={launcher} screenshots={screenshots} />
		default:
			return <MemoryStep system={system} screenshots={screenshots} />
	}
}
