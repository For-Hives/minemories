import { type ReactNode, useState } from 'react'
import { Link } from 'react-router'
import { RadiusMap, SeasonDemo, ShareDemo } from '../components/diagrams'
import { FileTree, Glyph, type GlyphName, More, TabPanel, type TabSpec, TabStrip } from '../components/explainers'
import { MemoryScene } from '../components/MemoryScene'
import { buttonLime } from '../components/ui'
import type { DemoTheme } from '../content/discovery'
import { type FaqEntry, faqGroups, faqText, type QuestionId, questions } from '../content/faq'
import { T, useI18n } from '../i18n/I18n'

export const infoLinks = [
	{ to: '/concept', label: 'The concept' },
	{ to: '/how-it-works', label: 'How it works' },
	{ to: '/installation', label: 'Install the mod' },
	{ to: '/downloads', label: 'All downloads' },
	{ to: '/faq', label: 'FAQ' },
]

export function InfoNavigation() {
	const { t } = useI18n()

	return (
		<nav aria-label={t('Minemories guides')} className="mm-info-nav">
			{infoLinks.map(link => (
				<Link key={link.to} to={link.to}>
					{t(link.label)}
				</Link>
			))}
		</nav>
	)
}

function InfoPage({ title, children }: { title: string; children: ReactNode }) {
	const { locale, t } = useI18n()
	return (
		<article lang={locale} className="mm-info">
			<InfoNavigation />
			<h1>{t(title)}</h1>
			{children}
			<InfoNavigation />
		</article>
	)
}

type Persona = 'admin' | 'parent' | 'player' | 'creator'
const personas: Array<TabSpec<Persona> & { theme: DemoTheme; line: string }> = [
	{
		id: 'admin',
		label: 'An admin',
		glyph: 'shield',
		theme: 'village',
		line: 'Capture the places of the group before the server closes.',
	},
	{ id: 'parent', label: 'A parent', glyph: 'heart', theme: 'home', line: 'Keep a build made with your child.' },
	{
		id: 'player',
		label: 'A casual player',
		glyph: 'home',
		theme: 'garden',
		line: 'Revisit your house whenever you like.',
	},
	{
		id: 'creator',
		label: 'A modpack creator',
		glyph: 'cube',
		theme: 'village',
		line: 'Keep a record of your modded builds.',
	},
]
const canDo: Array<[GlyphName, string]> = [
	['view', 'Look around in 3D'],
	['globe', 'Open it in any browser'],
	['link', 'Share it by link'],
]
const cannotDo: Array<[GlyphName, string]> = [
	['refresh', 'Resume the game'],
	['pencil', 'Break blocks'],
	['disk', 'Replace your backup'],
]

function CanList({ title, items, tone }: { title: string; items: Array<[GlyphName, string]>; tone: 'yes' | 'no' }) {
	const { t } = useI18n()
	return (
		<div className={`ex-can-${tone}`}>
			<h2>{t(title)}</h2>
			<ul>
				{items.map(([glyph, label]) => (
					<li key={label}>
						<Glyph name={glyph} />
						{t(label)}
					</li>
				))}
			</ul>
		</div>
	)
}

export function ConceptPage() {
	const { t } = useI18n()
	const [persona, setPersona] = useState<Persona>('admin')
	return (
		<InfoPage title="Your Minecraft world, ready to visit in 3D">
			<SeasonDemo />
			<div className="ex-can">
				<CanList title="You can" items={canDo} tone="yes" />
				<CanList title="You cannot" items={cannotDo} tone="no" />
			</div>
			<h2>
				<T message={'Who is it for?'} />
			</h2>
			<TabStrip
				base="persona"
				label={t('Who is it for?')}
				tabs={personas.map(item => ({ ...item, label: t(item.label) }))}
				value={persona}
				onChange={setPersona}
			/>
			{personas.map(item => (
				<TabPanel key={item.id} base="persona" id={item.id} active={item.id === persona}>
					<div className="ex-persona">
						<MemoryScene theme={item.theme} label={t(item.label)} />
						<p>{t(item.line)}</p>
					</div>
				</TabPanel>
			))}
			<p>
				<Link className={buttonLime} to="/how-it-works">
					<T message={'Create my first memory, step by step'} />
				</Link>
			</p>
		</InfoPage>
	)
}

type Step = 'install' | 'capture' | 'file' | 'upload' | 'share'
const steps: Array<TabSpec<Step>> = [
	{ id: 'install', label: 'Install', glyph: 'download' },
	{ id: 'capture', label: 'Capture', glyph: 'crosshair' },
	{ id: 'file', label: 'File', glyph: 'cube' },
	{ id: 'upload', label: 'Upload', glyph: 'cloud' },
	{ id: 'share', label: 'Share', glyph: 'link' },
]

function InstallStep() {
	return (
		<>
			<h2>
				<T message={'1. Install and open the world'} />
			</h2>
			<ul className="ex-loaders">
				{['NeoForge', 'Fabric', 'Forge'].map(loader => (
					<li key={loader}>
						<Glyph name="cube" />
						{loader}
					</li>
				))}
			</ul>
			<p>
				<Link className={buttonLime} to="/installation">
					<T message={'guides.install.action'} />
				</Link>
			</p>
			<More>
				<p>
					<Link to="/installation">
						<T message={'guides.install.action'} />
					</Link>{' '}
					<T
						message={
							'on your computer, then open your world or join your server using its usual compatible profile. The server must still be accessible to capture its builds.'
						}
					/>
				</p>
			</More>
		</>
	)
}

function CaptureStep() {
	return (
		<>
			<h2>
				<T message={'2. Choose a small area and capture it'} />
			</h2>
			<RadiusMap />
			<More>
				<p>
					<T message={'For your first attempt, stand near the build and type'} /> <code>/minemories export 16</code>{' '}
					<T
						message={
							'in chat. 16 is the radius in blocks around you; accepted values range from 2 to 128. Start small: a large area can slow the game. The mod captures what the client has loaded, not the entire server.'
						}
					/>
				</p>
				<p>
					<T
						message={
							'By default, underground capture is limited to the depth visited in this area, with at least five blocks of margin below the visited position. Entering a cave extends future captures of that area. The visited depth is recorded on your computer only. Cavities above this limit may still appear. In M → Settings → Memories → Auto captures, “Captured depth” can switch to the full dimension; an explicit selection keeps the height of its two corners.'
						}
					/>
				</p>
				<p>
					<T message={'For a precise area, stand at the first corner and enter'} />{' '}
					<code>/minemories select first</code>
					<T message={', then at the opposite corner with'} /> <code>/minemories select second</code>
					<T message={'. These positions also define the height. Check with'} /> <code>/minemories select status</code>
					<T message={', then run'} /> <code>/minemories export selection</code>.<code> /minemories select clear</code>{' '}
					<T message={'clears the selection.'} />
				</p>
				<p>
					<T
						message={
							'The M key opens the Minemories menu. To connect your gallery: M → type the code → Connect. Then “Take a memory” sends each memory to your private gallery on its own; without an account, it stays on your computer. If M is already taken, change the key in Options → Controls → Key Binds.'
						}
					/>
				</p>
				<p>
					<T
						message={
							'The sides and bottom of the capture are closed with a dirt/stone appearance, like an extracted piece of world. These faces are added to the 3D memory: no blocks are changed in Minecraft.'
						}
					/>
				</p>
			</More>
		</>
	)
}

function FileStep() {
	return (
		<>
			<h2>
				<T message={'3. Find the file on your computer'} />
			</h2>
			<FileTree />
			<More>
				<p>
					<T message={'The result is a file named'} /> <code>capture.glb</code> <T message={'in the folder'} />{' '}
					<code>export</code> <T message={'under your user directory ('} />
					<code>~/export/capture.glb</code>
					<T
						message={
							') by default, not in the world folder. In M → Settings → Memories, you can choose another folder and click “Save”; “Save here” exports without connecting an account. Here GLB means a 3D file containing shapes and textures. With the current mod version, every dated capture and its information are also kept in the subfolder'
						}
					/>{' '}
					<code>history</code>. <code>capture.glb</code>
					<T
						message={
							'points to the latest export. In the M menu, “My memories” lets you choose an older memory and send it to your gallery. Keep your own backups: the history takes up space on your computer.'
						}
					/>
				</p>
				<p>
					<T
						message={
							'To revisit it on the site, send this memory from M → My memories, then open it in your private gallery.'
						}
					/>
				</p>
			</More>
		</>
	)
}

function UploadStep() {
	return (
		<>
			<h2>
				<T message={'4. Upload to your gallery, if you choose'} />
			</h2>
			<ol className="ex-chain">
				<li>
					<Glyph name="key" />
					<Link to="/gallery">
						<T message={'Get a code in your gallery'} />
					</Link>
				</li>
				<li>
					<Glyph name="code" />
					<T message={'In Minecraft: M → type the code → Connect'} />
				</li>
				<li>
					<Glyph name="cloud" />
					<T message={'Your memories go to your gallery on their own'} />
				</li>
			</ol>
			<p className="ex-line">
				<T message={'The code lasts 5 minutes and works once.'} />
			</p>
			<More>
				<ol>
					<li>
						<Link to="/register">
							<T message={'Create your account'} />
						</Link>{' '}
						<T message={'or'} />{' '}
						<Link to="/login">
							<T message={'sign in'} />
						</Link>
						<T message={', then open'} />{' '}
						<Link to="/gallery">
							<T message={'My gallery'} />
						</Link>
						.
					</li>
					<li>
						<T
							message={
								'Get the 6-digit code in your gallery. In Minecraft: M → type the code → Connect. The code works once, for 5 minutes.'
							}
						/>
					</li>
					<li>
						<T
							message={
								'From then on, every memory taken with M → Take a memory, or AFK, goes to your private gallery on its own. Any other: M → My memories → Send this memory.'
							}
						/>
					</li>
				</ol>
				<p>
					<T
						message={
							'AFK captures are enabled by default: after 5 minutes of inactivity, at most once every 4 hours, even in the pause menu or while Minecraft is in the background. Without a connected account, they stay in your local folder. With a connected account, they also upload to your private gallery. The “Auto memories” button in M turns them on or off; M → Settings → Memories → Auto captures adjusts the delays and capture radius (32 blocks by default). A previously saved disable preference is preserved.'
						}
					/>
				</p>
				<p>
					<strong>
						<T message={'Use your own API (advanced)'} />
					</strong>
				</p>
				<p>
					<T message={'The mod uses'} /> <code>https://api.minemories.net</code>{' '}
					<T
						message={
							'by default. In M → Settings → Account, you can enter the HTTPS address of a compatible self-hosted Minemories API, then click “Save”. HTTP is accepted only for an API on localhost. Changing API disconnects the account: generate a new code in the gallery belonging to that API. The “Official address” button restores the official address; save to apply it.'
						}
					/>
				</p>
			</More>
		</>
	)
}

function ShareStep() {
	return (
		<>
			<h2>
				<T message={'5. Share only what you choose'} />
			</h2>
			<ShareDemo />
			<More>
				<p>
					<T
						message={
							'The gallery is private by default. On a capture, “Share” then “Create a link” creates a link accessible to anyone who has it; they can forward it too. You can revoke the link from this panel, but this does not delete copies someone has already saved.'
						}
					/>
				</p>
				<p>
					<T
						message={
							'The link also shows the coordinates, the world name, the seed (in single player) or the server name or address.'
						}
					/>{' '}
					<T message={'Avoid places or text with personal information, and ask the other builders first.'} />
				</p>
			</More>
		</>
	)
}

const stepBody: Record<Step, () => ReactNode> = {
	install: InstallStep,
	capture: CaptureStep,
	file: FileStep,
	upload: UploadStep,
	share: ShareStep,
}

export function HowItWorksPage() {
	const { t } = useI18n()
	const [step, setStep] = useState<Step>('install')
	return (
		<InfoPage title="From Minecraft world to 3D memory">
			<TabStrip
				base="step"
				label={t('From Minecraft world to 3D memory')}
				tabs={steps.map(item => ({ ...item, label: t(item.label) }))}
				value={step}
				onChange={setStep}
			/>
			{steps.map(item => {
				const Body = stepBody[item.id]
				return (
					<TabPanel key={item.id} base="step" id={item.id} active={item.id === step}>
						<Body />
					</TabPanel>
				)
			})}
		</InfoPage>
	)
}

/** Questions and their short answers, from content/faq.ts. On /faq each one carries its anchor (`/faq#ban`). */
export function Questions({ ids, anchors = false }: { ids: readonly QuestionId[]; anchors?: boolean }) {
	const { t } = useI18n()
	return (
		<div className="ex-faq">
			{ids.map(id => {
				const entry: FaqEntry = questions[id]
				const { question, answer } = faqText(id, t)
				return (
					<div key={id} className="ex-faq-item" id={anchors ? id : undefined}>
						<h3>{anchors ? <a href={`#${id}`}>{question}</a> : question}</h3>
						<p>
							{answer}
							{entry.link && (
								<>
									{' '}
									<Link to={entry.link.to}>{t(entry.link.label)} →</Link>
								</>
							)}
						</p>
					</div>
				)
			})}
		</div>
	)
}

export function FaqPage() {
	const { t } = useI18n()
	return (
		<InfoPage title="Frequently asked questions">
			{faqGroups.map(group => (
				<section key={group.label} className="ex-faq-group">
					<h2>{t(group.label)}</h2>
					<Questions ids={group.ids} anchors />
				</section>
			))}
			<p>
				<Link className={buttonLime} to="/installation">
					{t('Install the mod')}
				</Link>
			</p>
		</InfoPage>
	)
}
