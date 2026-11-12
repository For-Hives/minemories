import { useState } from 'react'
import { Link } from 'react-router'
import { Command, FileTree, More } from '../components/explainers'
import { buttonLime, buttonOutline } from '../components/ui'
import { pageQuestions } from '../content/faq'
import { translate } from '../i18n/catalog'
import { type Locale, Rich, useI18n } from '../i18n/I18n'
import { localeTag } from '../i18n/locales'
import { siteOrigin } from '../route-metadata'
import { InfoPage, Questions } from './InfoPages'
import { catalogLinks } from './installation-loaders'

function InstallButton({ source }: { source?: string }) {
	const { t } = useI18n()
	return (
		<p>
			<Link className={buttonLime} to={source ? `/installation?src=${source}` : '/installation'}>
				{t('Install the mod')}
			</Link>
		</p>
	)
}

/** The announcement an admin pastes in the server's chat or Discord: the install link carries `src=server`. */
export const announcementUrl = new URL('/installation?src=server', siteOrigin).href
const announcement =
	'The server closes on {date}. To keep your base in 3D: install Minemories ({url}), go to your base, press M → Take a memory. You can then revisit it in 3D and show it to us here!'

/** The visitor's language first, then the other of French and English, so both are always offered. */
function announcementLocales(locale: Locale): Locale[] {
	return [locale, locale.startsWith('en') ? 'fr' : 'en']
}

function Announcement({ language }: { language: Locale }) {
	const { locale, t } = useI18n()
	const [copied, setCopied] = useState(false)
	const tag = localeTag(language)
	const text = translate(language, announcement, { date: translate(language, '[date]'), url: announcementUrl })
	const spoken = new Intl.Locale(tag).language
	const name = new Intl.DisplayNames([localeTag(locale)], { type: 'language' }).of(spoken) ?? spoken
	async function copy() {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)
		} catch {
			setCopied(false)
		}
	}
	return (
		<figure className="ex-announce">
			<figcaption>{name}</figcaption>
			<blockquote lang={tag}>{text}</blockquote>
			<button
				type="button"
				className={buttonOutline}
				aria-label={`${t('Copy')} : ${name}`}
				onClick={() => {
					void copy()
				}}
			>
				{copied ? t('Copied') : t('Copy')}
			</button>
		</figure>
	)
}

/** /server-closing: the season ends, the SMP wipes, the free host deletes. Three honest ways to keep a base. */
export function ServerClosingPage() {
	const { locale, t } = useI18n()
	return (
		<InfoPage title="Your server is closing. Your base can stay.">
			<p className="ex-lead">
				{t('Capture it before it closes.')} {t('10 minutes to install, one key in your base.')} {t('No admin needed.')}
			</p>
			<h2>{t('Your three options')}</h2>
			<ol className="ex-steps">
				<li>
					<h3>{t('Ask the admin for the world')}</h3>
					<p>{t('A ZIP to play again later, as long as you keep the right version and the right mods.')}</p>
				</li>
				<li>
					<h3>{t('Make a playable copy')}</h3>
					<p>{t('Mods like WorldTools download what you’ve seen. Ask the admin first.')}</p>
				</li>
				<li>
					<h3>{t('Keep a 3D memory with Minemories')}</h3>
					<p>
						{t('Install the mod, go to your base, press M → Take a memory.')}{' '}
						{t('Then open it in your browser and send your friends a link to walk around it.')}
					</p>
				</li>
			</ol>
			<section id="aternos" aria-labelledby="aternos-title">
				<h2 id="aternos-title">{t('A server on Aternos?')}</h2>
				<p>
					{t('Aternos deletes a server nobody has started for several months.')}{' '}
					{t('Capture your base while you still play there.')}
				</p>
			</section>
			<section id="admin" className="ex-admin" aria-labelledby="admin-title">
				<h2 id="admin-title">{t('Are you the admin?')}</h2>
				<ul>
					<li>
						{t(
							'Nothing to install on your side: the mod runs on the players’ computers and only reads what their game already shows.'
						)}
					</li>
					<li>{t('Your players don’t get a playable copy of your world, just a 3D scene of their corner.')}</li>
				</ul>
				<h3>{t('An announcement to copy')}</h3>
				{announcementLocales(locale).map(language => (
					<Announcement key={language} language={language} />
				))}
			</section>
			<h2>{t('Questions')}</h2>
			<Questions ids={pageQuestions.serverClosing} />
			<InstallButton source="server-closing" />
		</InfoPage>
	)
}

const checksumCommands = [
	['Windows', 'certutil -hashfile minemories.jar SHA256'],
	['macOS', 'shasum -a 256 minemories.jar'],
	['Linux', 'sha256sum minemories.jar'],
] as const

/** /safety: the parents' questions, answered with what can be checked. */
export function SafetyPage() {
	const { t } = useI18n()
	const curseForge = catalogLinks().find(link => link.name === 'CurseForge')
	return (
		<InfoPage title="Is Minemories safe?">
			<section className="ex-parents" aria-labelledby="parents-title">
				<h2 id="parents-title">{t('For parents, in 5 lines')}</h2>
				<ul>
					<li>{t('It’s a .jar file for Minecraft Java, never a .exe.')}</li>
					<li>{t('Nothing goes online until the game is connected to an account.')}</li>
					<li>{t('Once connected, the memories go to a private gallery.')}</li>
					<li>
						{t('Nobody sees them without a link your child created.')}{' '}
						{t('The public gallery is reviewed before publication.')}
					</li>
					<li>
						{t(
							'Everything turns off in the game (M → Auto memories, M → Settings → Privacy), and the account can be deleted.'
						)}
					</li>
				</ul>
			</section>
			<section id="verifier" aria-labelledby="verifier-title">
				<h2 id="verifier-title">{t('Download from the right place')}</h2>
				<p>
					{t('Only from this site or our CurseForge page.')} <Link to="/downloads">{`${t('Downloads')}\u00a0→`}</Link>
					{curseForge && (
						<>
							{' '}
							<a href={curseForge.url} rel="noopener">
								CurseForge&nbsp;→
							</a>
						</>
					)}
				</p>
				<More label={t('Check the checksum (advanced)')}>
					<p>
						{t(
							'In a terminal, in the folder of the file (put its real name in place of minemories.jar). The result must match the SHA-256 shown on the downloads page.'
						)}
					</p>
					<ul className="ex-commands">
						{checksumCommands.map(([system, command]) => (
							<li key={system}>
								<span>{system}</span> <Command text={command} />
							</li>
						))}
					</ul>
				</More>
			</section>
			<h2>{t('What goes online, and when')}</h2>
			{/* biome-ignore lint/a11y/noNoninteractiveTabindex: the table scrolls on its own on a phone; keyboard users need to reach it. */}
			<section className="ex-table-scroll" tabIndex={0} aria-label={t('What goes online, and when')}>
				<table className="ex-compare ex-compare--two">
					<thead>
						<tr>
							<th scope="col">{t('Before connecting the game')}</th>
							<th scope="col">{t('After connecting the game')}</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>{t('Nothing')}</td>
							<td>
								<p>
									{t(
										'Your memories, with their date, position, dimension, biome and weather, and the world name and seed (single player) or the server name or address and its icon. Only you see them.'
									)}
								</p>
								<p>
									{t(
										'Cleaned-up error reports: at most 8 waiting, kept 7 days at most, without messages, paths, names, coordinates, seed or passwords.'
									)}{' '}
									{t('Turn them off in M → Settings → Privacy → Diagnostics.')}
								</p>
							</td>
						</tr>
					</tbody>
				</table>
			</section>
			<h2>{t('What someone with a link sees')}</h2>
			<p>
				{t(
					'Heads-up: the link shows your base’s coordinates and the server name or address. Think before posting it publicly. It also shows the dimension, biome, world name and seed (in single player).'
				)}
			</p>
			<p>{t('The 3D scene, its name and its date.')}</p>
			<p>
				{t('Stop sharing blocks new visits, not a copy already made.')} {t('Players nearby appear with their skin.')}{' '}
				{t('Ask them before you share.')}
			</p>
			<h2>{t('Delete everything')}</h2>
			<p>
				{t('A memory: from your gallery (30 days in the trash).')}{' '}
				{t('Your account: write to us, the contact address is coming soon.')}{' '}
				{t('We then delete the account, its memories, its links and its devices.')}
			</p>
			<p className="ex-links">
				<Link to="/privacy">{t('Privacy')}</Link> <Link to="/faq">{t('All questions')}</Link>
			</p>
			<InstallButton />
		</InfoPage>
	)
}

/** A selection export: the block looked at becomes each corner (ClientRuntime.selectCorner). */
const selectionCommands = [
	'/minemories select first',
	'/minemories select second',
	'/minemories export selection',
] as const

/** /guides/minecraft-blender: export an area from the game with the chat command, then import the GLB into Blender. */
export function BlenderGuidePage() {
	const { t } = useI18n()
	return (
		<InfoPage title="Your Minecraft build in Blender, in one file">
			<p className="ex-lead">
				{t('Textures, transparency and lights are in the file. It works in multiplayer and with mods.')}
			</p>
			<ol className="ex-steps">
				<li>
					<h2>{t('1. Export from the game')}</h2>
					<p>{t('Install Minemories and stand in the middle of your build. In the chat:')}</p>
					<ul className="ex-commands">
						<li>
							<Rich
								message={'{command} takes 128 blocks around you.'}
								slots={{ command: <Command text="/minemories export" /> }}
							/>
						</li>
						<li>
							<Rich
								message={'{command} takes less: a radius from 2 to 128.'}
								slots={{ command: <Command text="/minemories export 48" /> }}
							/>
						</li>
					</ul>
					<p>{t('For a precise area: look at one corner, then the opposite corner, then export.')}</p>
					<ol className="ex-commands">
						{selectionCommands.map(command => (
							<li key={command}>
								<Command text={command} />
							</li>
						))}
					</ol>
				</li>
				<li>
					<h2>{t('2. Find the file')}</h2>
					<p>
						{t(
							'It lands in the export folder of your home folder: capture.glb is the latest, and every dated memory is in history.'
						)}{' '}
						{t('No account needed.')}
					</p>
					<FileTree />
				</li>
				<li>
					<h2>{t('3. Import it into Blender')}</h2>
					<p>
						{t('In Blender: File → Import → glTF 2.0 (.glb/.gltf).')}{' '}
						{t('Each part comes in as its own object: {parts}.', {
							parts: 'terrain, decor, fluids, block_entities, entities',
						})}{' '}
						{t('Apply the scale before you model: Object → Apply → Scale.')}
					</p>
				</li>
			</ol>
			<p>
				{t(
					'Tools such as Mineways or jmc2obj read the world save: on a server, you need the admin’s copy. Minemories exports from your game.'
				)}
			</p>
			<h2>{t('Questions')}</h2>
			<Questions ids={pageQuestions.blender} />
			<InstallButton />
		</InfoPage>
	)
}
