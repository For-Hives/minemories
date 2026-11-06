import { T } from '../i18n/I18n'
import { guideUrl } from './installation-loaders'
import type { LoaderTarget } from './mod-releases'

export function InstallationHelp({ target }: { target: LoaderTarget }) {
	const values = {
		java: target.java,
		loader: target.name,
		minecraft: target.minecraft,
		version: target.loaderVersion,
	}
	return (
		<section id="aide" className="install-help" aria-labelledby="help-title">
			<span className="install-eyebrow">
				<T message={'A little help'} />
			</span>
			<h2 id="help-title">
				<T message={'If a step gets stuck'} />
			</h2>
			<details>
				<summary>
					<T message={'The loader installer will not open'} />
				</summary>
				<p>
					<T
						message={
							'You need Java {java} to open the installer. On Windows, try right-click → Open with → Java. If it is missing, install Temurin {java} using the link in the loader step. On macOS or Linux, follow the official guide for {loader} to run the installer. Do not change security settings at random.'
						}
						params={values}
					/>{' '}
					<a href={guideUrl(target)}>
						<T message={'Official guide for {loader}'} params={values} />
					</a>
				</p>
			</details>
			<details>
				<summary>
					<T message={'I cannot find the mods folder or the mod does not appear'} />
				</summary>
				<p>
					<T message={'Open the folder from the profile you launch, rather than another Minecraft folder. Create'} />{' '}
					<code>mods</code>{' '}
					<T
						message={
							'if it is missing. Check that the file ends in .jar, not .jar.zip, then fully close the game and restart the {loader} {version} profile. Worlds belong in saves; the mod belongs in mods.'
						}
						params={values}
					/>
				</p>
			</details>
			<details>
				<summary>
					<T message={'M opens another menu, or the command is unknown'} />
				</summary>
				<p>
					<T
						message={
							'Change the Minemories key in Options → Controls → Key Binds. An unknown command often means the mod is not loaded: check its entry in Mods, the versions and the profile folder.'
						}
					/>
				</p>
			</details>
			<details>
				<summary>
					<T message={'Minecraft crashes at startup'} />
				</summary>
				<p>
					<T
						message={
							'Check Minecraft {minecraft}, your loader version ({loader} {version}), that the JAR matches this loader and that Minemories is not duplicated. Remove the Minemories JAR to return to the previous profile. Ask for help with the error message and versions used; do not delete your world.'
						}
						params={values}
					/>
				</p>
			</details>
			<details>
				<summary>
					<T message={'The capture is empty, incomplete or uploading fails'} />
				</summary>
				<p>
					<T
						message={
							'Wait for terrain to load, move closer to the build and try again with radius 16. Some modded blocks are not reproduced faithfully. If uploading fails, keep capture.glb and view it locally. Check your connection, generate another code if five minutes have passed and retry; the mod upload limit is 450 MiB.'
						}
					/>
				</p>
			</details>
		</section>
	)
}
