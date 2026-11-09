import { useState } from 'react'
import { buttonOutline } from '../components/ui'
import { Rich, T, useI18n } from '../i18n/I18n'
import { guideUrl, installerUrl, javaUrl } from './installation-loaders'
import type { System } from './installation-state'
import type { LoaderTarget } from './mod-releases'
import { WindowsScreenshot } from './WindowsScreenshot'

export const folders: Record<System, string> = {
	windows: '%APPDATA%\\.minecraft-minemories',
	mac: '~/Library/Application Support/minecraft-minemories',
	linux: '~/.minecraft-minemories',
}
export const exports: Record<System, string> = {
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

export function InstallerLine({ target }: { target: LoaderTarget }) {
	const installer = (
		<a href={installerUrl(target)}>
			<T message={'the {loader} {version} installer'} params={{ loader: target.name, version: target.loaderVersion }} />
		</a>
	)
	if (target.loader === 'fabric')
		return (
			<Rich
				message={
					'Download {installer}. Open it with Java, choose Minecraft {minecraft} and Fabric Loader {version}, then click Install. Wait for the success message.'
				}
				slots={{ installer, minecraft: target.minecraft, version: target.loaderVersion }}
			/>
		)
	return (
		<Rich
			message={'Download {installer}. Open it with Java, select {option}, then confirm. Wait for the success message.'}
			slots={{ installer, option: <strong>Install client</strong> }}
		/>
	)
}

export function LoaderInstaller({
	target,
	system,
	walkthrough,
}: {
	target: LoaderTarget
	system: System
	walkthrough: boolean
}) {
	const { t } = useI18n()
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
					<InstallerLine target={target} />
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
			</p>
		</>
	)
}

export function OtherLaunchers({ target }: { target: LoaderTarget }) {
	return (
		<details className="install-launchers">
			<summary>
				<T message={'I use CurseForge, Modrinth App or another launcher'} />
			</summary>
			<h4>CurseForge</h4>
			<ol>
				<li>
					<Rich
						message={'Open {app}, choose Minecraft, then {action}.'}
						slots={{
							app: <a href="https://www.curseforge.com/download/app">CurseForge</a>,
							action: (
								<strong>
									<T message={'Create Custom Profile'} />
								</strong>
							),
						}}
					/>
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
					<Rich
						message={'Open {app} and sign in to your Minecraft account.'}
						slots={{ app: <a href="https://modrinth.com/app">Modrinth App</a> }}
					/>
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
