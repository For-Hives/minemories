import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { T, useI18n } from '../i18n/I18n'
import { detectSystem, type System, systems } from '../lib/platform'
import { InfoNavigation } from './InfoPages'
import { InstallationGuide } from './InstallationGuide'
import { InstallationHelp } from './InstallationHelp'
import { systemNames } from './InstallationQuestions'
import { InstallationScene } from './InstallationScene'
import { InstallationStep, installStepIds, stepTitles } from './InstallationSteps'
import {
	defaults,
	type GuideState,
	presetFromSearch,
	readGuide,
	resetGuide,
	saveGuide,
	targetFor,
	walkthrough,
} from './installation-state'
import { latestDownloadUrl } from './mod-releases'
import './installation.css'

/** "It looks like you are on Windows", with a quiet way to correct the guess. */
function DetectedSystem({ system, onChange }: { system: System; onChange: (value: System) => void }) {
	const { t } = useI18n()
	const [open, setOpen] = useState(false)
	return (
		<div className="install-detected">
			<p>
				<T message={'It looks like you are on {system}.'} params={{ system: systemNames[system] }} />{' '}
				<button type="button" className="install-quiet" aria-expanded={open} onClick={() => setOpen(value => !value)}>
					<T message={'Not right? Change'} />
				</button>
			</p>
			{open && (
				<fieldset className="install-switch">
					<legend className="install-sr-only">{t('Which computer do you play on?')}</legend>
					{systems.map(value => (
						<button
							key={value}
							type="button"
							aria-pressed={system === value}
							onClick={() => {
								onChange(value)
								setOpen(false)
							}}
						>
							{systemNames[value]}
						</button>
					))}
				</fieldset>
			)}
		</div>
	)
}

function Welcome({
	system,
	onSystem,
	onStart,
}: {
	system: System
	onSystem: (value: System) => void
	onStart: () => void
}) {
	return (
		<>
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
							message={'No coding required. Pick how you want to install it, and we will take it one step at a time.'}
						/>
					</p>
				</div>
				<div className="install-hero-art">
					<InstallationScene step={0} />
					<span>
						<T message={'Build. Capture. Return.'} />
					</span>
				</div>
			</header>
			<DetectedSystem system={system} onChange={onSystem} />
			<div className="install-ways">
				<button type="button" className="install-way install-way--main" onClick={onStart}>
					<strong>
						<T message={'Guided installation'} />
					</strong>
					<span>
						<T message={'A few quick questions, then one simple step at a time.'} />
					</span>
				</button>
				<Link className="install-way" to="/downloads">
					<strong>
						<T message={'See all downloads'} />
					</strong>
					<span>
						<T message={'Every Minecraft version and loader in one table, ready to download.'} />
					</span>
				</Link>
			</div>
			<p className="install-view-only">
				<T message={'Just here to view a shared memory? Open its link: there is nothing to install.'} />{' '}
				<a href="#aide">
					<T message={'Need help?'} />
				</a>
			</p>
		</>
	)
}

/** The installation guide: a calm welcome screen with two ways in, then either the interactive steps or the download table. */
export function InstallationPage() {
	const { locale, t } = useI18n()
	const navigate = useNavigate()
	const [params] = useSearchParams()
	const preset = useRef(presetFromSearch(params))
	const [guide, setGuide] = useState<GuideState>(defaults)
	const [restored, setRestored] = useState(false)
	const [enteredByClick, setEnteredByClick] = useState(false)
	useEffect(() => {
		const saved = readGuide()
		const base = saved ?? { ...defaults, system: detectSystem(navigator) }
		setGuide(
			preset.current
				? { ...base, ...preset.current, step: 'system', active: true, preset: true, needsLoader: false }
				: base
		)
		if (preset.current) navigate('/installation', { replace: true })
		setRestored(true)
	}, [navigate])
	useEffect(() => {
		if (restored) saveGuide(guide)
	}, [guide, restored])
	const update = (value: Partial<GuideState>) => setGuide(current => ({ ...current, ...value }))
	const target = targetFor(guide.minecraft, guide.loader)
	return (
		<article lang={locale} className="installation">
			{guide.active ? (
				<>
					<h1 className="install-guide-title">
						<T message={'Install the Minemories mod'} />
					</h1>
					<InstallationGuide
						guide={guide}
						update={update}
						focusOnEnter={enteredByClick}
						onExit={() => update({ active: false, step: 'system' })}
						onRestart={() => {
							setGuide(resetGuide(guide.system))
						}}
					/>
				</>
			) : (
				<Welcome
					system={guide.system}
					onSystem={system => update({ system })}
					onStart={() => {
						setEnteredByClick(true)
						update({ active: true, step: 'system', preset: false })
					}}
				/>
			)}
			<InstallationHelp target={target} />
			<p className="install-caption install-final-note">
				<T message={'Minemories is experimental: start with a test world and keep your local files.'} />
			</p>
			<InfoNavigation />
			<noscript>
				<section className="install-help">
					<h2>
						<T message={'Manual Windows guide without JavaScript'} />
					</h2>
					<p>
						<T message={'Download the mod from'} />{' '}
						<a href={latestDownloadUrl(walkthrough.minecraft, walkthrough.loader)}>Minemories</a>
						<T message={'. Here are all the steps for Minecraft Launcher:'} />
					</p>
					{installStepIds.map(step => (
						<section key={step}>
							<h3>{t(stepTitles[step])}</h3>
							<InstallationStep
								step={step}
								system="windows"
								target={targetFor(walkthrough.minecraft, walkthrough.loader)}
								needsLoader
							/>
						</section>
					))}
				</section>
			</noscript>
		</article>
	)
}
