import { type ReactNode, useRef, useState } from 'react'
import { Link } from 'react-router'
import { buttonLime, buttonOutline } from '../components/ui'
import { Rich, T, useI18n } from '../i18n/I18n'
import { formatBytes } from '../lib/bytes'
import {
	type Answers,
	chooseMinecraft,
	effectiveTarget,
	fileWay,
	type GuideState,
	noLoader,
	type StepId,
	starterLoader,
} from '../lib/install-guide'
import { type System, systems } from '../lib/platform'
import { GameScreenshot } from './GameScreenshot'
import { catalogLinks, fabricApiUrl, installerUrl, javaUrl } from './installation-loaders'
import { versionBadge } from './installation-state'
import { downloadFor, type LoaderTarget, latestDownloadUrl } from './mod-releases'
import { isExperimentalMinecraft, javaFor, listedMinecraft, loaderTargets, quiltTested } from './mod-targets'
import { useModReleases } from './useModReleases'

/*
 * The screens of the installation guide. Each one renders in two forms: inside the stepper, for the visitor's own
 * version, loader and system, and in the static guide (`target` null) that the prerendered page and a visitor without
 * JavaScript read, which covers every case at once.
 */

export const systemNames: Record<System, string> = { windows: 'Windows', mac: 'macOS', linux: 'Linux' }
const modsFolders: Record<System, string> = {
	windows: '%APPDATA%\\.minecraft\\mods',
	mac: '~/Library/Application Support/minecraft/mods',
	linux: '~/.minecraft/mods',
}
const openFolder: Record<System, string> = {
	windows: 'Press Windows + R, paste this path, then press Enter.',
	mac: 'In Finder, choose Go → Go to Folder (Shift + Cmd + G), paste this path, then press Enter.',
	linux: 'In your file manager, press Ctrl + L, paste this path, then press Enter.',
}

/** The title of each screen (catalogue keys); the app screen names its catalog. */
export const stepTitles: Record<StepId, string> = {
	version: 'Which Minecraft version do you play?',
	loader: 'Which mod loader do you use?',
	way: 'How do you add your mods?',
	'loader-install': 'Install the loader',
	app: 'Install it with the {app} app',
	download: 'Download the mod',
	place: 'Put it in the mods folder',
	check: 'Check that it works',
	connect: 'Connect the game',
	memory: 'Your first memory',
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

/**
 * "It looks like you are on Windows", with a quiet way to correct the guess. `pending` keeps its room but hides it until
 * the browser has detected the system, so the line below it does not move.
 */
export function DetectedSystem({
	system,
	onChange,
	pending = false,
}: {
	system: System
	onChange: (value: System) => void
	pending?: boolean
}) {
	const { t } = useI18n()
	const [open, setOpen] = useState(false)
	const toggle = useRef<HTMLButtonElement>(null)
	return (
		<div
			className={pending ? 'install-detected install-pending' : 'install-detected'}
			aria-hidden={pending || undefined}
		>
			<p>
				<T message={'It looks like you are on {system}.'} params={{ system: systemNames[system] }} />{' '}
				<button
					ref={toggle}
					type="button"
					className="install-quiet"
					aria-expanded={open}
					onClick={() => setOpen(value => !value)}
				>
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
								// The pressed button disappears with the list: focus goes back to the toggle.
								toggle.current?.focus()
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

interface Choice {
	value: string
	label: string
	hint?: string | undefined
	badge?: string | null
}
/** A group of large radio cards: native radios keep arrow-key navigation and screen reader semantics. */
function ChoiceCards({
	name,
	legend,
	choices,
	value,
	onChange,
}: {
	name: string
	legend: string
	choices: Choice[]
	value: string
	onChange: (value: string) => void
}) {
	return (
		<fieldset className="install-cards">
			<legend className="install-sr-only">{legend}</legend>
			{choices.map(choice => (
				<label key={choice.value} className="install-card">
					<input
						type="radio"
						name={name}
						value={choice.value}
						checked={choice.value === value}
						onChange={() => onChange(choice.value)}
					/>
					<span className="install-card-face">
						<strong>{choice.label}</strong>
						{choice.hint && <small>{choice.hint}</small>}
						{choice.badge && <em>{choice.badge}</em>}
					</span>
				</label>
			))}
		</fieldset>
	)
}

/** "Label: text", with the punctuation of the visitor's language (French puts a no-break space before the colon). */
function Labelled({ label, children }: { label: ReactNode; children: ReactNode }) {
	return <Rich message={'{label}: {text}'} slots={{ label, text: children }} />
}

function Goal({ children }: { children: ReactNode }) {
	return <p className="install-goal">{children}</p>
}
/** The line opening a screen that only some visitors need, in the static guide. */
function OnlyIf({ children }: { children: ReactNode }) {
	return <p className="install-only-if">{children}</p>
}
function ExperimentalNote({ minecraft }: { minecraft: string }) {
	if (!isExperimentalMinecraft(minecraft)) return null
	return (
		<p className="install-note">
			<T message={'Experimental: not tried in game yet. Try it on a test world first.'} />
		</p>
	)
}

/** Every version and its loaders: what a search engine and a visitor without JavaScript read. */
function LoaderTable() {
	const { t } = useI18n()
	return (
		<div className="install-table-scroll">
			<table className="install-table">
				<caption className="install-sr-only">{t('Loaders for each Minecraft version')}</caption>
				<thead>
					<tr>
						<th scope="col">Minecraft</th>
						<th scope="col">{t('Loaders')}</th>
						<th scope="col">Java</th>
					</tr>
				</thead>
				<tbody>
					{listedMinecraft().map(minecraft => {
						const badge = versionBadge(minecraft)
						return (
							<tr key={minecraft}>
								<th scope="row">
									{minecraft}
									{badge && <em>{t(badge)}</em>}
								</th>
								<td>
									{loaderTargets
										.filter(target => target.minecraft === minecraft)
										.map(target => target.name)
										.join(', ')}
								</td>
								<td>{javaFor(minecraft)}</td>
							</tr>
						)
					})}
				</tbody>
			</table>
		</div>
	)
}

function DontKnowVersion() {
	return (
		<details>
			<summary>
				<T message={'I don’t know'} />
			</summary>
			<p>
				<T
					message={
						'Your version shows in your launcher, next to the Play button, and at the bottom left of the Minecraft menu.'
					}
				/>
			</p>
		</details>
	)
}

/** What a question screen receives in the stepper: the answers so far, and a way to change them. */
export interface QuestionProps {
	guide: GuideState
	onAnswer: (answers: Answers) => void
}

function VersionQuestion({ guide, onAnswer }: QuestionProps) {
	const { t } = useI18n()
	return (
		<>
			<Goal>
				<T message={'Pick the version of Minecraft Java you launch. The mod file must match it.'} />
			</Goal>
			<ChoiceCards
				name="minecraft"
				legend={t('Which Minecraft version do you play?')}
				value={guide.minecraft}
				choices={listedMinecraft().map(minecraft => {
					const badge = versionBadge(minecraft)
					return {
						value: minecraft,
						label: minecraft,
						hint: t('Java {java}', { java: javaFor(minecraft) ?? '' }),
						badge: badge && t(badge),
					}
				})}
				onChange={minecraft => onAnswer(chooseMinecraft(loaderTargets, guide, minecraft))}
			/>
			<ExperimentalNote minecraft={guide.minecraft} />
			<DontKnowVersion />
		</>
	)
}

function LoaderNotes({ guide }: { guide: GuideState }) {
	const target = effectiveTarget(loaderTargets, guide)
	return (
		<>
			{target?.fabricApi && (
				<p>
					<Rich
						message={'Also add {fabricApi}, otherwise the game won’t start.'}
						slots={{ fabricApi: <a href={fabricApiUrl(target)}>Fabric API</a> }}
					/>
				</p>
			)}
			{guide.minecraft === quiltTested.minecraft && (
				<p>
					<T message={'Quilt: take the Fabric JAR.'} />
				</p>
			)}
		</>
	)
}

function LoaderQuestion({ guide, onAnswer }: QuestionProps) {
	const { t } = useI18n()
	const loaders = loaderTargets.filter(target => target.minecraft === guide.minecraft)
	const starter = starterLoader(loaderTargets, guide.minecraft)
	return (
		<>
			<Goal>
				<T message={'A loader is what lets Minecraft run mods. Pick the one your profile uses.'} />
			</Goal>
			<ChoiceCards
				name="loader"
				legend={t('Which mod loader do you use?')}
				value={guide.loader}
				choices={[
					...loaders.map(target => ({ value: target.loader, label: target.name })),
					{
						value: noLoader,
						label: t('I have no mod loader yet'),
						hint: starter ? t('We’ll install {loader} together.', { loader: starter.name }) : undefined,
					},
				]}
				onChange={loader => onAnswer({ ...guide, loader })}
			/>
			<LoaderNotes guide={guide} />
		</>
	)
}

function WayQuestion({ guide, onAnswer }: QuestionProps) {
	const { t } = useI18n()
	return (
		<>
			<Goal>
				<T message={'Both ways work: pick the one you already use.'} />
			</Goal>
			<ChoiceCards
				name="way"
				legend={t('How do you add your mods?')}
				value={guide.way}
				choices={[
					...catalogLinks().map(catalog => ({
						value: catalog.name,
						label: t('With the {app} app', { app: catalog.name }),
						hint: t('The app installs Minemories and what it needs.'),
					})),
					{
						value: fileWay,
						label: t('I add the file myself'),
						hint: t('Official launcher, Prism or another one: you download one file and drop it in a folder.'),
					},
				]}
				onChange={way => onAnswer({ ...guide, way })}
			/>
		</>
	)
}

/** The question screens of the stepper. */
export const questions: Partial<Record<StepId, (props: QuestionProps) => ReactNode>> = {
	version: VersionQuestion,
	loader: LoaderQuestion,
	way: WayQuestion,
}

/** The same questions in the static guide: what each answer depends on, with every version and loader listed. */
export function StaticVersion() {
	return (
		<>
			<Goal>
				<T message={'Pick the version of Minecraft Java you launch. The mod file must match it.'} />
			</Goal>
			<LoaderTable />
			<DontKnowVersion />
		</>
	)
}
export function StaticLoader() {
	return (
		<>
			<Goal>
				<T message={'A loader is what lets Minecraft run mods. Pick the one your profile uses.'} />
			</Goal>
			<p>
				<T message={'No loader yet? We’ll install one together in the loader step below.'} />
			</p>
			<p>
				<T message={'On Fabric, add Fabric API.'} />{' '}
				<T message={'In {minecraft}, Quilt works with the Fabric JAR.'} params={{ minecraft: quiltTested.minecraft }} />
			</p>
		</>
	)
}
export function StaticWay() {
	const { t } = useI18n()
	return (
		<ul className="install-paths">
			{catalogLinks().map(catalog => (
				<li key={catalog.name}>
					<Labelled label={<strong>{t('With the {app} app', { app: catalog.name })}</strong>}>
						{t('The app installs Minemories and what it needs.')}
					</Labelled>
				</li>
			))}
			<li>
				<Labelled label={<strong>{t('I add the file myself')}</strong>}>
					{t('Official launcher, Prism or another one: you download one file and drop it in a folder.')}
				</Labelled>
			</li>
		</ul>
	)
}

/**
 * The loader installer link. Forge and NeoForge ship one installer per loader version; the Fabric installer has its own
 * version and installs any Fabric Loader, so its link names no version.
 */
function InstallerLink({ target }: { target: LoaderTarget }) {
	return (
		<a href={installerUrl(target)}>
			{target.loader === 'fabric' ? (
				<T message={'the {loader} installer'} params={{ loader: target.name }} />
			) : (
				<T
					message={'the {loader} {version} installer'}
					params={{ loader: target.name, version: target.loaderVersion }}
				/>
			)}
		</a>
	)
}

export function LoaderInstallStep({ target }: { target: LoaderTarget | null }) {
	const { t } = useI18n()
	if (!target)
		return (
			<>
				<OnlyIf>
					<T message={'Only if you have no mod loader yet.'} />
				</OnlyIf>
				<ul className="install-paths">
					{listedMinecraft().flatMap(minecraft => {
						const starter = starterLoader(loaderTargets, minecraft)
						if (!starter) return []
						return (
							<li key={minecraft}>
								<Rich
									message={'Minecraft {minecraft}: {installer}, with {java}.'}
									slots={{
										minecraft,
										installer: <InstallerLink target={starter} />,
										java: <a href={javaUrl(starter)}>{t('Java {java}', { java: starter.java })}</a>,
									}}
								/>
							</li>
						)
					})}
				</ul>
				<p>
					<T
						message={
							'Open the installer, pick your Minecraft version, then install the client. Launch the new profile once, then close the game.'
						}
					/>
				</p>
			</>
		)
	return (
		<>
			<Goal>
				<T message={'Install {loader} so that Minecraft can load mods.'} params={{ loader: target.name }} />
			</Goal>
			<ol>
				<li>
					<Rich
						message={'Install Java {java} if you don’t have it: {link}.'}
						slots={{
							java: target.java,
							link: (
								<a href={javaUrl(target)}>
									<T message={'Temurin, a free Java build'} />
								</a>
							),
						}}
					/>
				</li>
				<li>
					{target.loader === 'fabric' ? (
						<Rich
							message={
								'Download {installer}, open it, pick Minecraft {minecraft} and Fabric Loader {loaderVersion}, then click Install.'
							}
							slots={{
								installer: <InstallerLink target={target} />,
								minecraft: target.minecraft,
								loaderVersion: target.loaderVersion,
							}}
						/>
					) : (
						<Rich
							message={'Download {installer}, open it with Java, choose {install}, then confirm.'}
							slots={{ installer: <InstallerLink target={target} />, install: <strong>Install client</strong> }}
						/>
					)}
				</li>
				<li>
					<T
						message={'Launch the new {loader} profile once in your launcher, then close the game.'}
						params={{ loader: target.name }}
					/>
				</li>
			</ol>
		</>
	)
}

export function AppStep({ app, target }: { app: string; target: LoaderTarget | null }) {
	const catalog = catalogLinks().find(item => item.name === app)
	return (
		<>
			{!target && (
				<OnlyIf>
					<T message={'Only if you use the {app} app.'} params={{ app }} />
				</OnlyIf>
			)}
			<ol>
				<li>
					{target ? (
						<T
							message={'Create a profile for Minecraft {minecraft} with {loader}, or open yours.'}
							params={{ minecraft: target.minecraft, loader: target.name }}
						/>
					) : (
						<T message={'Create a profile with your Minecraft version and loader, or open yours.'} />
					)}
				</li>
				<li>
					<T message={'Search for Minemories, then install it.'} />
				</li>
			</ol>
			{(!target || target.fabricApi) && (
				<p>
					<T message={'On Fabric, the app also adds Fabric API.'} />
				</p>
			)}
			{catalog && (
				<p>
					<a className={buttonOutline} href={catalog.url}>
						<T message={'Minemories on {app}'} params={{ app }} />
					</a>
				</p>
			)}
		</>
	)
}

/** The download button; once the index answers, the exact version and size, or "not published yet". */
function DownloadButton({ target }: { target: LoaderTarget }) {
	const { locale } = useI18n()
	const { releases, status, retry } = useModReleases()
	const latest = releases
		.map(release => ({ release, download: downloadFor(release, target.loader, target.minecraft) }))
		.find(item => item.download)
	if (status === 'ready' && !latest)
		return (
			<p>
				<strong>
					<T message={'Not published yet'} />
				</strong>{' '}
				<Link to="/downloads">
					<T message={'All downloads'} />
				</Link>
			</p>
		)
	return (
		<>
			<p>
				<a className={buttonLime} href={latestDownloadUrl(target.minecraft, target.loader)}>
					<T
						message={'Download for Minecraft {minecraft} · {loader}'}
						params={{ minecraft: target.minecraft, loader: target.name }}
					/>
				</a>
			</p>
			{status === 'error' && (
				// The index did not answer: the link to the newest JAR stays, with a way to ask again (as on /downloads).
				<div className="install-note install-actions" role="status">
					<span>
						<T message={'The list of versions could not be loaded. Try again in a moment.'} />
					</span>
					<button type="button" className={buttonOutline} onClick={retry}>
						<T message={'Retry'} />
					</button>
					<Link to="/downloads">
						<T message={'All downloads'} />
					</Link>
				</div>
			)}
			{latest?.download && (
				<p className="install-caption">
					<T
						message={'Minemories {version} · {size}'}
						params={{ version: latest.release.version, size: formatBytes(latest.download.bytes, locale) }}
					/>
				</p>
			)}
		</>
	)
}

export function DownloadStep({ target }: { target: LoaderTarget | null }) {
	return (
		<>
			{target ? (
				<>
					<Goal>
						<T message={'Download the Minemories JAR: the single file that adds the mod to your game.'} />
					</Goal>
					<DownloadButton target={target} />
					{target.fabricApi && (
						<p>
							<Rich
								message={'On Fabric, also download {link}.'}
								slots={{ link: <a href={fabricApiUrl(target)}>Fabric API {target.fabricApi}</a> }}
							/>
						</p>
					)}
					<ExperimentalNote minecraft={target.minecraft} />
				</>
			) : (
				<>
					<OnlyIf>
						<T message={'Only if you add the file yourself.'} />
					</OnlyIf>
					<p>
						<Rich
							message={'Get the JAR that matches your version and loader: {downloads}.'}
							slots={{
								downloads: (
									<Link to="/downloads">
										<T message={'All downloads'} />
									</Link>
								),
							}}
						/>
					</p>
				</>
			)}
			<details>
				<summary>
					<T message={'Do I run this file?'} />
				</summary>
				<p>
					<T message={'No: you just copy it into the mods folder. Only a loader installer opens with Java.'} />
				</p>
			</details>
		</>
	)
}

export function PlaceStep({
	target,
	system,
	onSystem,
}: {
	target: LoaderTarget | null
	system: System
	onSystem: (system: System) => void
}) {
	const { t } = useI18n()
	return (
		<>
			<Goal>
				<T message={'Close Minecraft completely before copying the file.'} />
			</Goal>
			<ol>
				<li>
					<T message={'Open the mods folder. With the official Minecraft Launcher, it’s here by default:'} />
					{target ? (
						<>
							<CopyText text={modsFolders[system]} label="Copy the mods folder path" />
							<span className="install-caption">{t(openFolder[system])}</span>
							<DetectedSystem system={system} onChange={onSystem} />
						</>
					) : (
						<ul className="install-paths">
							{systems.map(value => (
								<li key={value}>
									<Labelled label={systemNames[value]}>
										<code>{modsFolders[value]}</code> {t(openFolder[value])}
									</Labelled>
								</li>
							))}
						</ul>
					)}
				</li>
				<li>
					<T message={'No mods folder? Create one called mods, all lowercase.'} />
				</li>
				<li>
					<T message={'Copy the JAR into it. Keep only one Minemories JAR: remove the old one when you update.'} />
				</li>
			</ol>
			<figure className="install-folder" aria-label={t('File location')}>
				{target ? (
					<>
						<span>{modsFolders[system]}</span>
						{/* The name the download serves (modJarName in the API contract); the version is the release's. */}
						<strong>└─ minemories-{target.id}-….jar</strong>
						{target.fabricApi && <span>└─ fabric-api-{target.fabricApi}.jar</span>}
					</>
				) : (
					<>
						<span>mods</span>
						<strong>└─ minemories-….jar</strong>
					</>
				)}
			</figure>
			<details>
				<summary>
					<T message={'Using Prism or another launcher?'} />
				</summary>
				<p>
					<T message={'Each profile has its own folder: open it from the launcher, then go into mods.'} />
				</p>
			</details>
		</>
	)
}

export function CheckStep({ target }: { target: LoaderTarget | null }) {
	return (
		<>
			<Goal>
				{target ? (
					<T
						message={'Launch Minecraft with the {loader} profile, then open a world and wait for it to load.'}
						params={{ loader: target.name }}
					/>
				) : (
					<T message={'Launch Minecraft with your loader’s profile, then open a world.'} />
				)}
			</Goal>
			<p>
				<T message={'In a world, press M: the Minemories menu opens. It’s also in Options (the Minemories icon).'} />
			</p>
			<p className="install-note">
				<strong>
					<T message={'The menu opens? The mod is installed.'} />
				</strong>
			</p>
			<GameScreenshot id="minemoriesMenu" />
		</>
	)
}

export function ConnectStep() {
	const { t } = useI18n()
	return (
		<>
			<p>
				{t('Create your account, open your gallery and get the 6-digit code.')}{' '}
				{t('In Minecraft: M → type the code → Connect.')}
			</p>
			<p>
				<Link className={buttonLime} to="/gallery">
					<T message={'Open my gallery'} />
				</Link>
			</p>
		</>
	)
}

function ExportFolders() {
	const { t } = useI18n()
	const you = t('<you>')
	const folders = [
		['Windows', `C:\\Users\\${you}\\export`],
		['macOS', `/Users/${you}/export`],
		['Linux', `/home/${you}/export`],
	]
	return (
		<ul className="install-paths">
			{folders.map(([system, path]) => (
				<li key={system}>
					<Labelled label={system}>
						<code>{path}</code>
					</Labelled>
				</li>
			))}
		</ul>
	)
}

export function MemoryStep() {
	const { t } = useI18n()
	return (
		<>
			<p>
				{t('Press M → Take a memory.')} {t('It then goes to your gallery on its own.')}
			</p>
			<p>
				{t('Memories taken before you connected?')} {t('M → My memories → Send this memory.')}
			</p>
			<details>
				<summary>
					<T message={'Without an account'} />
				</summary>
				<p>
					<T
						message={'Your memory stays as a GLB file in the export folder of your home folder. It opens in Blender.'}
					/>
				</p>
				<ExportFolders />
				<p>
					<Link to="/guides/minecraft-blender">{t('Open my build in Blender')} →</Link>
				</p>
			</details>
		</>
	)
}

/** One instruction screen of the stepper, for the visitor's answers. */
export function InstructionStep({
	step,
	guide,
	onSystem,
}: {
	step: StepId
	guide: GuideState
	onSystem: (system: System) => void
}) {
	const target = effectiveTarget(loaderTargets, guide)
	const screens: Partial<Record<StepId, () => ReactNode>> = {
		'loader-install': () => <LoaderInstallStep target={target} />,
		app: () => <AppStep app={guide.way} target={target} />,
		download: () => <DownloadStep target={target} />,
		place: () => <PlaceStep target={target} system={guide.system} onSystem={onSystem} />,
		check: () => <CheckStep target={target} />,
		connect: () => <ConnectStep />,
		memory: () => <MemoryStep />,
	}
	return screens[step]?.() ?? null
}
