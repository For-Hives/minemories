import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { buttonLime, buttonOutline } from '../components/ui'
import { T, useI18n } from '../i18n/I18n'
import { InfoNavigation } from './InfoPages'
import { InstallationScene } from './InstallationScene'
import { InstallationStep, stepNames } from './InstallationSteps'
import { guideUrl } from './installation-loaders'
import {
	defaults,
	type GuideState,
	loadersFor,
	readGuide,
	resetGuide,
	type System,
	saveGuide,
	targetFor,
} from './installation-state'
import { type LoaderTarget, latestDownloadUrl, minecraftVersions } from './mod-releases'
import './installation.css'

function GuidePreferences({ guide, update }: { guide: GuideState; update: (value: Partial<GuideState>) => void }) {
	const { t } = useI18n()
	const target = targetFor(guide.minecraft, guide.loader)
	return (
		<section className="install-preferences" aria-labelledby="preferences-title">
			<div>
				<span className="install-eyebrow">
					<T message={'Your way'} />
				</span>
				<h2 id="preferences-title">
					<T message={'Your computer. Your journey.'} />
				</h2>
				<p>
					<T message={'The steps adapt to your choices. You can change them at any time.'} />
				</p>
			</div>
			<div className="install-fields">
				<fieldset>
					<legend>
						<T message={'You play on…'} />
					</legend>
					<div className="install-choices">
						{(
							[
								['windows', 'Windows'],
								['mac', 'macOS'],
								['linux', 'Linux'],
							] as const
						).map(([value, label]) => (
							<button
								key={value}
								type="button"
								className={buttonOutline}
								aria-pressed={guide.system === value}
								onClick={() => update({ system: value as System })}
							>
								{t(label)}
							</button>
						))}
					</div>
				</fieldset>
				<fieldset>
					<legend>
						<T message={'Your Minecraft version…'} />
					</legend>
					<div className="install-choices">
						{minecraftVersions().map(version => (
							<button
								key={version}
								type="button"
								className={buttonOutline}
								aria-pressed={target.minecraft === version}
								onClick={() =>
									update({ minecraft: version, loader: targetFor(version, guide.loader).loader, done: [], step: 0 })
								}
							>
								{version}
							</button>
						))}
					</div>
				</fieldset>
				<fieldset>
					<legend>
						<T message={'Mod loader'} />
					</legend>
					<div className="install-choices">
						{loadersFor(target.minecraft).map(item => (
							<button
								key={item.loader}
								type="button"
								className={buttonOutline}
								aria-pressed={target.loader === item.loader}
								onClick={() => update({ loader: item.loader, done: [], step: 0 })}
							>
								{item.name}
							</button>
						))}
					</div>
				</fieldset>
				<p className="install-summary">
					Minecraft Java {target.minecraft} · {target.name} {target.loaderVersion} · Java {target.java}
				</p>
			</div>
		</section>
	)
}

function InstallationHelp({ target }: { target: LoaderTarget }) {
	const values = {
		java: target.java,
		loader: target.name,
		minecraft: target.minecraft,
		version: target.loaderVersion,
	}
	return (
		<section className="install-help" aria-labelledby="help-title">
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
							'You need Java {java} to open the installer. On Windows, try right-click → Open with → Java. If it is missing, install Temurin {java} using the link in step 2. On macOS or Linux, follow the official guide for {loader} to run the installer. Do not change security settings at random.'
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

export function InstallationPage() {
	const { t, locale } = useI18n()

	const [guide, setGuide] = useState(() => ({ ...defaults, done: [] as number[] }))
	const [restored, setRestored] = useState(false)
	const heading = useRef<HTMLHeadingElement>(null)
	const [moveFocus, setMoveFocus] = useState(false)
	useEffect(() => {
		setGuide(readGuide())
		setRestored(true)
	}, [])
	useEffect(() => {
		if (restored) saveGuide(guide)
	}, [guide, restored])
	useEffect(() => {
		if (moveFocus) heading.current?.focus()
	}, [guide.step, moveFocus])
	function update(value: Partial<GuideState>) {
		setGuide(current => ({ ...current, ...value }))
	}
	function goTo(step: number) {
		setMoveFocus(true)
		update({ step })
	}
	function completeStep() {
		setMoveFocus(true)
		setGuide(current => ({
			...current,
			done: [...new Set([...current.done, current.step])],
			step: Math.min(5, current.step + 1),
		}))
	}
	const complete = guide.done.length === 6
	const target = targetFor(guide.minecraft, guide.loader)
	return (
		<article lang={locale} className="installation">
			<header className="install-hero">
				<div>
					<span className="install-eyebrow">
						<T message={'Your first memory starts here'} />
					</span>
					<h1>
						<T message={'Install the Minemories mod'} />
					</h1>
					<p className="install-lead">
						<T message={'One small file.'} />
						<br />
						<T message={'A new way to keep your worlds.'} />
					</p>
					<p>
						<T
							message={
								'We will take this one step at a time. No coding required: choose your computer, follow the guide and keep your first memory in 3D.'
							}
						/>
					</p>
					<a className={`${buttonLime} install-primary`} href="#parcours">
						<T message={'Start installing'} /> <span aria-hidden="true">↓</span>
					</a>
					<p className="install-caption">
						<T
							message={'Minecraft Java {versions} · NeoForge, Fabric or Forge · Experimental mod'}
							params={{ versions: minecraftVersions().join(', ') }}
						/>
					</p>
				</div>
				<div className="install-hero-art">
					<InstallationScene step={guide.step} />
					<span>
						<T message={'Build. Capture. Return.'} />
					</span>
				</div>
			</header>
			<p className="install-view-only">
				<T message={'Just here to view a shared memory? Open its link: there is nothing to install.'} />
			</p>
			<GuidePreferences guide={guide} update={update} />
			<section id="parcours" className="install-journey" aria-label={t('Step-by-step guide')}>
				<div className="install-progress-heading">
					<div>
						<span className="install-eyebrow">
							<T message={'Your turn'} />
						</span>
						<h2>
							<T message={'From download to first memory.'} />
						</h2>
					</div>
					<span role="status">
						{guide.done.length} <T message={'/ 6 steps checked'} />
					</span>
				</div>
				<progress value={guide.done.length} max={6} aria-label={t('Installation progress')} />
				<div className="install-workspace">
					<nav className="install-step-nav" aria-label={t('Installation steps')}>
						{stepNames.map((name, index) => (
							<button
								key={name}
								type="button"
								aria-current={guide.step === index ? 'step' : undefined}
								onClick={() => goTo(index)}
							>
								<span
									className={`install-step-number${guide.done.includes(index) ? ' is-done' : ''}`}
									aria-hidden="true"
								>
									{guide.done.includes(index) ? '✓' : `0${index + 1}`}
								</span>
								<span>
									{t(name)}
									{guide.done.includes(index) && (
										<small>
											<T message={'Step checked'} />
										</small>
									)}
								</span>
							</button>
						))}
					</nav>
					<div className="install-panel" key={`${target.id}-${guide.step}`}>
						<div className="install-panel-meta">
							<span>
								<T message={'Step 0'} />
								{guide.step + 1}
							</span>
							<span>
								{target.name} · Minecraft {target.minecraft}
							</span>
						</div>
						<h3 ref={heading} tabIndex={-1}>
							{t(stepNames[guide.step] ?? '')}
						</h3>
						<InstallationStep step={guide.step} system={guide.system} target={target} />
						<div className="install-panel-actions">
							<button
								className={`${buttonOutline} install-secondary`}
								type="button"
								disabled={guide.step === 0}
								onClick={() => goTo(guide.step - 1)}
							>
								<T message={'← Previous'} />
							</button>
							<button className={`${buttonLime} install-primary`} type="button" onClick={completeStep}>
								{guide.step === 5 ? t('My memory opens in 3D') : t("Done, let's continue")}{' '}
								<span aria-hidden="true">✓</span>
							</button>
						</div>
						<p className="install-caption">
							<T message={'Check a step when you have completed it. You can also move freely between steps.'} />
						</p>
					</div>
				</div>
				{complete && (
					<div className="install-success" role="status">
						<span aria-hidden="true">✦</span>
						<div>
							<h2>
								<T message={'Your first memory is here.'} />
							</h2>
							<p>
								<T
									message={
										'If the capture opens correctly, you have completed this first trial. Keep a world backup too: a 3D memory cannot resume your game.'
									}
								/>
							</p>
							<Link to="/fonctionnement">
								<T message={'Explore captures, the gallery and sharing →'} />
							</Link>
						</div>
					</div>
				)}
				<div className="install-resume">
					<p>
						<T
							message={
								'Your choices and progress stay in this browser on this device. You can close this page and return.'
							}
						/>
					</p>
					<button
						type="button"
						onClick={() => {
							setMoveFocus(false)
							setGuide(resetGuide())
						}}
					>
						<T message={'Start again and clear my choices'} />
					</button>
				</div>
			</section>
			<InstallationHelp target={target} />
			<p className="install-caption install-final-note">
				<T
					message={
						'Minemories is experimental: start with a test world and keep your local files. Checked steps are reminders; they do not verify the game for you.'
					}
				/>
			</p>
			<InfoNavigation />
			<noscript>
				<section className="install-help">
					<h2>
						<T message={'Manual Windows guide without JavaScript'} />
					</h2>
					<p>
						<T message={'Download the mod from'} />{' '}
						<a href={latestDownloadUrl(defaults.minecraft, defaults.loader)}>Minemories</a>
						<T message={'. Here are all the steps for Minecraft Launcher:'} />
					</p>
					{stepNames.map((name, index) => (
						<section key={name}>
							<h3>
								{index + 1}. {t(name)}
							</h3>
							<InstallationStep step={index} system="windows" target={targetFor(defaults.minecraft, defaults.loader)} />
						</section>
					))}
				</section>
			</noscript>
		</article>
	)
}
