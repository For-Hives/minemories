import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { buttonLime, buttonOutline } from '../components/ui'
import { pageQuestions } from '../content/faq'
import { Rich, T, useI18n } from '../i18n/I18n'
import { GameScreenshot } from './GameScreenshot'
import { Questions } from './InfoPages'
import { catalogLinks, fabricApiUrl, installerUrl } from './installation-loaders'
import {
	type Choice,
	chooseMinecraft,
	loadersFor,
	noChoice,
	presetFromSearch,
	readChoice,
	saveChoice,
	starterLoader,
	targetFor,
	validatedMinecraft,
	versionBadge,
} from './installation-state'
import { type LoaderTarget, latestDownloadUrl, listedMinecraft } from './mod-releases'
import './installation.css'

/** Large radio cards: native radios keep arrow-key navigation and screen reader semantics. */
function ChoiceCards({
	name,
	legend,
	choices,
	value,
	onChange,
}: {
	name: string
	legend: string
	choices: Array<{ value: string; label: string; badge?: string | null }>
	value: string
	onChange: (value: string) => void
}) {
	const { t } = useI18n()
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
						{choice.badge && <em>{t(choice.badge)}</em>}
					</span>
				</label>
			))}
		</fieldset>
	)
}

function CurseForgeWay() {
	const curseforge = catalogLinks().find(catalog => catalog.name === 'CurseForge')
	if (!curseforge) return null
	return (
		<section className="install-block install-block--easy" aria-labelledby="install-curseforge">
			<h2 id="install-curseforge">
				<T message={'The easiest way: the CurseForge app'} />
			</h2>
			<p>
				<T message={'Open your profile → search for Minemories → Install. The app adds Fabric API on its own.'} />
			</p>
			<p className="install-actions">
				<a className={buttonOutline} href={curseforge.url}>
					<T message={'Minemories on CurseForge'} />
				</a>
				<a href="#connecter">
					<T message={'Then connect the game ↓'} />
				</a>
			</p>
		</section>
	)
}

/** "Playing without mods?": the loader to install first, Fabric where the version has it. */
function NoModsLine({ minecraft }: { minecraft: string }) {
	const starter = starterLoader(minecraft)
	const link = (
		<a href={starter ? installerUrl(starter) : 'https://fabricmc.net/use/installer/'}>
			<T message={'its official installer'} />
		</a>
	)
	return (
		<p>
			<strong>
				<T message={'Playing without mods?'} />
			</strong>{' '}
			{starter && starter.loader !== 'fabric' ? (
				<Rich
					message={'Install {loader} with {installer}, then Minemories. Allow 5 more minutes.'}
					slots={{ loader: starter.name, installer: link }}
				/>
			) : (
				<Rich
					message={'Install Fabric with {installer}, then Fabric API, then Minemories. Allow 5 more minutes.'}
					slots={{ installer: link }}
				/>
			)}
		</p>
	)
}

/** Every version and its loaders, visible before any choice: what a search engine and a visitor without JavaScript read. */
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
									{loadersFor(minecraft)
										.map(target => target.name)
										.join(', ')}
								</td>
							</tr>
						)
					})}
				</tbody>
			</table>
		</div>
	)
}

function LoaderNotes({ choice }: { choice: Choice }) {
	const target = targetFor(choice.minecraft, choice.loader)
	return (
		<>
			<NoModsLine minecraft={choice.minecraft} />
			{target?.fabricApi && (
				<p>
					<Rich
						message={'Also add {fabricApi}, otherwise the game does not start.'}
						slots={{ fabricApi: <a href={fabricApiUrl(target)}>Fabric API</a> }}
					/>
				</p>
			)}
			{choice.minecraft === validatedMinecraft && (
				<p>
					<T message={'Quilt: take the Fabric JAR.'} />
				</p>
			)}
		</>
	)
}

function VersionAndLoader({ choice, onChange }: { choice: Choice; onChange: (choice: Choice) => void }) {
	const { t } = useI18n()
	const loaders = loadersFor(choice.minecraft)
	return (
		<section className="install-block" aria-labelledby="install-version">
			<h2 id="install-version">
				<T message={'Which Minecraft version do you play?'} />
			</h2>
			<ChoiceCards
				name="minecraft"
				legend={t('Which Minecraft version do you play?')}
				value={choice.minecraft}
				choices={listedMinecraft().map(value => ({ value, label: value, badge: versionBadge(value) }))}
				onChange={value => onChange(chooseMinecraft(choice, value))}
			/>
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
			<h2 id="install-loader">
				<T message={'Which mod loader do you use?'} />
			</h2>
			{loaders.length > 0 ? (
				<ChoiceCards
					name="loader"
					legend={t('Which mod loader do you use?')}
					value={choice.loader}
					choices={loaders.map(item => ({ value: item.loader, label: item.name }))}
					onChange={loader => onChange({ ...choice, loader })}
				/>
			) : (
				<p className="install-caption">
					<T message={'Pick your version first.'} />
				</p>
			)}
			<LoaderNotes choice={choice} />
			<LoaderTable />
		</section>
	)
}

const modsFolders = [
	['Windows', '%APPDATA%\\.minecraft\\mods'],
	['macOS', '~/Library/Application Support/minecraft/mods'],
	['Linux', '~/.minecraft/mods'],
]

function DownloadButton({ target }: { target: LoaderTarget | null }) {
	if (!target)
		return (
			<p className="install-caption">
				<Rich
					message={'Pick your version and your loader above, or open {downloads}.'}
					slots={{
						downloads: (
							<Link to="/downloads">
								<T message={'All downloads'} />
							</Link>
						),
					}}
				/>
			</p>
		)
	return (
		<p>
			<a className={buttonLime} href={latestDownloadUrl(target.minecraft, target.loader)}>
				<T
					message={'Download for Minecraft {minecraft} · {loader}'}
					params={{ minecraft: target.minecraft, loader: target.name }}
				/>
			</a>
		</p>
	)
}

function InstallBlock({ target }: { target: LoaderTarget | null }) {
	return (
		<section className="install-block" aria-labelledby="install-mod">
			<h2 id="install-mod">
				<T message={'Install the mod'} />
			</h2>
			<p>
				<T message={'Download the JAR, put it in the mods folder of your instance, then launch the game.'} />
			</p>
			<DownloadButton target={target} />
			<details>
				<summary>
					<T message={'Where is the mods folder?'} />
				</summary>
				<p>
					<T message={'Open the mods folder. With the official Minecraft Launcher, it is here by default:'} />
				</p>
				<ul className="install-paths">
					{modsFolders.map(([system, path]) => (
						<li key={system}>
							{system}: <code>{path}</code>
						</li>
					))}
				</ul>
			</details>
			<p>
				<T message={'In a world, press M: the Minemories menu opens. It is also in Options (the Minemories icon).'} />
			</p>
			<GameScreenshot id="minemoriesMenu" />
		</section>
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
					{system}: <code>{path}</code>
				</li>
			))}
		</ul>
	)
}

function ConnectAndCapture() {
	const { t } = useI18n()
	return (
		<>
			<section className="install-block" id="connecter" aria-labelledby="install-connect">
				<h2 id="install-connect">
					<T message={'Connect the game'} />
				</h2>
				<p>
					{t('Create your account, open your gallery and get the 6-digit code.')}{' '}
					{t('In Minecraft: M → type the code → Connect.')}
				</p>
				<p>
					<Link className={buttonLime} to="/gallery">
						<T message={'Open my gallery'} />
					</Link>
				</p>
			</section>
			<section className="install-block" aria-labelledby="install-memory">
				<h2 id="install-memory">
					<T message={'Your first memory'} />
				</h2>
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
			</section>
		</>
	)
}

/**
 * /installation: one page read top to bottom, complete without JavaScript. The version and loader cards only pick the
 * download button and the loader notes; no version is chosen in advance (a link from /downloads names one).
 */
export function InstallationPage() {
	const { locale, t } = useI18n()
	const [params] = useSearchParams()
	const search = params.toString()
	const [choice, setChoice] = useState<Choice>(noChoice)
	const [restored, setRestored] = useState(false)
	useEffect(() => {
		setChoice(presetFromSearch(new URLSearchParams(search)) ?? readChoice() ?? noChoice)
		setRestored(true)
	}, [search])
	useEffect(() => {
		if (restored) saveChoice(choice)
	}, [choice, restored])
	return (
		<article lang={locale} className="installation">
			<header className="install-intro">
				<h1>
					<T message={'Install Minemories'} />
				</h1>
				<p className="install-lead">
					<T message={'Minecraft Java on a computer · about 10 minutes · your worlds are not changed.'} />
				</p>
			</header>
			<CurseForgeWay />
			<VersionAndLoader choice={choice} onChange={setChoice} />
			<InstallBlock target={targetFor(choice.minecraft, choice.loader)} />
			<ConnectAndCapture />
			<section className="install-block" aria-labelledby="install-help">
				<h2 id="install-help">
					<T message={'If something goes wrong'} />
				</h2>
				<Questions ids={pageQuestions.installation} />
				<p className="install-actions">
					<Link to="/downloads">{t('All downloads')}</Link>
					<Link to="/faq">{t('All questions')}</Link>
					<Link to="/safety#verifier">{t('Check your file')}</Link>
				</p>
			</section>
		</article>
	)
}
