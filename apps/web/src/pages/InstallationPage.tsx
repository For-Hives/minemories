import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { T, useI18n } from '../i18n/I18n'
import { type GuideState, presetFromSearch, type StepId, stepIds } from '../lib/install-guide'
import { detectSystem, type System } from '../lib/platform'
import { InstallationGuide } from './InstallationGuide'
import { InstallationHelp } from './InstallationHelp'
import { InstallationScene } from './InstallationScene'
import {
	AppStep,
	CheckStep,
	ConnectStep,
	DetectedSystem,
	DownloadStep,
	LoaderInstallStep,
	MemoryStep,
	PlaceStep,
	StaticLoader,
	StaticVersion,
	StaticWay,
	stepTitles,
} from './InstallationSteps'
import { catalogLinks } from './installation-loaders'
import { clearGuide, readGuide, saveGuide, welcomeGuide } from './installation-state'
import { loaderTargets } from './mod-targets'
import './installation.css'

function GuidedWay() {
	return (
		<>
			<strong>
				<T message={'Guided installation'} />
			</strong>
			<span>
				<T message={'A few quick questions, then one simple step at a time.'} />
			</span>
		</>
	)
}

function Welcome({
	enhanced,
	system,
	onSystem,
	onStart,
	startRef,
}: {
	enhanced: boolean
	system: System
	onSystem: (value: System) => void
	onStart: () => void
	startRef: RefObject<HTMLButtonElement | null>
}) {
	return (
		<>
			<header className="install-hero">
				<div>
					<span className="install-eyebrow">
						<T message={'Your first memory starts here'} />
					</span>
					<h1>
						<T message={'Install Minemories'} />
					</h1>
					<p className="install-lead">
						<T message={'Minecraft Java on a computer · about 10 minutes · your worlds stay untouched.'} />
					</p>
				</div>
				<div className="install-hero-art">
					<InstallationScene />
					<span>
						<T message={'Build. Capture. Return.'} />
					</span>
				</div>
			</header>
			{/* Hidden until the browser has detected the system: before that, Windows would only be a guess. */}
			<DetectedSystem system={system} onChange={onSystem} pending={!enhanced} />
			<div className="install-ways">
				{/* Before hydration (and without JavaScript) a link to the full guide below; then the button that starts it. */}
				{enhanced ? (
					<button ref={startRef} type="button" className="install-way install-way--main" onClick={onStart}>
						<GuidedWay />
					</button>
				) : (
					<a className="install-way install-way--main" href="#etape-version">
						<GuidedWay />
					</a>
				)}
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

/** One section of the static guide: a screen of the stepper with its title, for every case at once. */
function StaticSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
	return (
		<section className="install-block" id={id} aria-labelledby={`${id}-title`}>
			<h2 id={`${id}-title`}>{title}</h2>
			{children}
		</section>
	)
}

/**
 * Every screen of the guide, top to bottom: the prerendered page, the first render before hydration and what a visitor
 * without JavaScript reads. Branch-only screens open with the case they are for.
 */
function StaticGuide({ system, onSystem }: { system: System; onSystem: (value: System) => void }) {
	const { t } = useI18n()
	const bodies: Record<StepId, () => ReactNode> = {
		version: () => <StaticVersion />,
		loader: () => <StaticLoader />,
		way: () => <StaticWay />,
		'loader-install': () => <LoaderInstallStep target={null} />,
		app: () => null,
		download: () => <DownloadStep target={null} />,
		place: () => <PlaceStep target={null} system={system} onSystem={onSystem} />,
		check: () => <CheckStep target={null} />,
		connect: () => <ConnectStep />,
		memory: () => <MemoryStep />,
	}
	return (
		<div className="install-static">
			{stepIds.map(step =>
				step === 'app' ? (
					catalogLinks().map(catalog => (
						<StaticSection
							key={catalog.name}
							id={`etape-app-${catalog.name.toLowerCase()}`}
							title={t(stepTitles.app, { app: catalog.name })}
						>
							<AppStep app={catalog.name} target={null} />
						</StaticSection>
					))
				) : (
					<StaticSection key={step} id={step === 'connect' ? 'connecter' : `etape-${step}`} title={t(stepTitles[step])}>
						{bodies[step]()}
					</StaticSection>
				)
			)}
		</div>
	)
}

/**
 * /installation: a welcome screen with two ways in, then the guided installation one screen at a time. Until the page
 * is hydrated it shows the whole guide below the welcome screen (the prerendered HTML, readable without JavaScript);
 * the stepper replaces it once the browser has restored the visitor's answers.
 */
export function InstallationPage() {
	const { locale } = useI18n()
	const [params, setParams] = useSearchParams()
	const search = params.toString()
	const [guide, setGuide] = useState<GuideState>(() => welcomeGuide('windows'))
	const [enhanced, setEnhanced] = useState(false)
	const [enteredByClick, setEnteredByClick] = useState(false)
	const [focusStart, setFocusStart] = useState(false)
	const startButton = useRef<HTMLButtonElement>(null)
	useEffect(() => {
		const detected = detectSystem(navigator)
		const saved = readGuide(detected)
		const preset = presetFromSearch(loaderTargets, new URLSearchParams(search))
		const base = saved ?? welcomeGuide(detected)
		const resumes = saved?.preset && saved.minecraft === preset?.minecraft && saved.loader === preset?.loader
		setGuide(preset && !resumes ? { ...base, ...preset, step: 'download', active: true } : base)
		setEnhanced(true)
	}, [search])
	useEffect(() => {
		if (enhanced) saveGuide(guide)
	}, [guide, enhanced])
	const update = (value: Partial<GuideState>) => setGuide(current => ({ ...current, ...value }))
	const active = enhanced && guide.active
	// Leaving the stepper unmounts the focused button: focus moves to "Guided installation" instead of the page's top.
	useEffect(() => {
		if (!focusStart || active) return
		startButton.current?.focus()
		setFocusStart(false)
	}, [focusStart, active])
	/**
	 * Back to the welcome screen. A link's query would bring its preset back on reload, so it goes; the guide is saved
	 * first, since dropping the query reruns the restore effect.
	 */
	function leave(next: GuideState) {
		setFocusStart(true)
		setGuide(next)
		if (!search) return
		saveGuide(next)
		setParams({}, { replace: true })
	}
	return (
		<article lang={locale} className="installation">
			{active ? (
				<>
					<h1 className="install-guide-title">
						<T message={'Install Minemories'} />
					</h1>
					<InstallationGuide
						guide={guide}
						update={update}
						focusOnEnter={enteredByClick}
						onExit={() =>
							// A preset's answers came from a link: the guided installation starts without them.
							leave(guide.preset ? welcomeGuide(guide.system) : { ...guide, active: false, step: 'version' })
						}
						onRestart={() => {
							clearGuide()
							leave(welcomeGuide(guide.system))
						}}
					/>
				</>
			) : (
				<Welcome
					enhanced={enhanced}
					system={guide.system}
					onSystem={system => update({ system })}
					startRef={startButton}
					onStart={() => {
						setEnteredByClick(true)
						update({ active: true, step: 'version', preset: false })
					}}
				/>
			)}
			{!enhanced && <StaticGuide system={guide.system} onSystem={system => update({ system })} />}
			<InstallationHelp step={active ? guide.step : null} />
			<p className="install-caption install-final-note">
				<T message={'Minemories is experimental: start with a test world and keep your local files.'} />
			</p>
		</article>
	)
}
