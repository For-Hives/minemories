import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { T, useI18n } from '../i18n/I18n'

export const infoLinks = [
	{ to: '/concept', label: 'The concept' },
	{ to: '/fonctionnement', label: 'How it works' },
	{ to: '/installation', label: 'Install the mod' },
	{ to: '/faq', label: 'FAQ' },
]

export function InfoNavigation() {
	const { t } = useI18n()

	return (
		<nav aria-label={t('Minemories guides')} className="flex flex-wrap gap-x-5 gap-y-3 py-5 text-sm">
			{infoLinks.map(link => (
				<Link key={link.to} to={link.to} className="underline">
					{t(link.label)}
				</Link>
			))}
		</nav>
	)
}

function InfoPage({ title, children }: { title: string; children: ReactNode }) {
	const { locale, t } = useI18n()
	return (
		<article
			lang={locale}
			className="mx-auto max-w-3xl px-6 py-10 text-base leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:font-bold [&_p]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-3 [&_a]:underline [&_code]:break-all"
		>
			<InfoNavigation />
			<h1 className="text-3xl font-bold">{t(title)}</h1>
			{children}
			<InfoNavigation />
		</article>
	)
}

export function ConceptPage() {
	return (
		<InfoPage title="The builds remain, even when the season ends">
			<p>
				<T
					message={
						'A base built with friends, a castle with your child, a first village: these are memories too. When the server closes, finding the right versions and all the mods to revisit them can be difficult.'
					}
				/>
			</p>
			<p>
				<T
					message={
						'Minemories turns an area of Minecraft into a 3D memory you can open in your browser. Once captured, you can revisit it without starting Minecraft or reinstalling the modpack.'
					}
				/>
			</p>
			<h2>
				<T message={'A memory to explore, a backup to keep'} />
			</h2>
			<p>
				<T
					message={
						'The capture is a three-dimensional snapshot of a place at a moment in time. You can look around, but cannot resume the game, break blocks or recover your inventory. Keep a world backup too if you want to keep playing: the 3D memory does not replace it.'
					}
				/>
			</p>
			<h2>
				<T message={'For you and the people you play with'} />
			</h2>
			<p>
				<T
					message={
						"At the end of a season, an admin can capture the group's places before closing the server. A parent can keep a build made with their child. An occasional player can revisit their house, and a modpack creator can keep a record of their modded builds."
					}
				/>
			</p>
			<h2>
				<T message={'What you can do today'} />
			</h2>
			<p>
				<T
					message={
						'Capture from the mod, upload to a private gallery and deliberately create a sharing link. Anyone receiving that link can view the capture without an account or mod.'
					}
				/>
			</p>
			<p>
				<T
					message={
						'Timelapse lets you browse dated captures of the same area. Direct recovery of old world folders, 3D printing and other Minecraft versions remain future ideas. Lifetime online storage is not guaranteed: keep your local files.'
					}
				/>
			</p>
			<p>
				<Link to="/fonctionnement">
					<T message={'Create my first memory, step by step'} />
				</Link>
			</p>
		</InfoPage>
	)
}

export function HowItWorksPage() {
	return (
		<InfoPage title="From Minecraft world to 3D memory">
			<h2>
				<T message={'1. Install and open the world'} />
			</h2>
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
			<h2>
				<T message={'2. Choose a small area and capture it'} />
			</h2>
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
						'By default, underground capture is limited to the depth visited in this area, with at least five blocks of margin below the visited position. Entering a cave extends future captures of that area. Tracking starts with this mod version and stays on your computer. Cavities above this limit may still appear. Advanced mode can capture the full height; an explicit selection keeps the height of its two corners.'
					}
				/>
			</p>
			<p>
				<T message={'For a precise area, stand at the first corner and enter'} /> <code>/minemories select first</code>
				<T message={', then at the opposite corner with'} /> <code>/minemories select second</code>
				<T message={'. These positions also define the height. Check with'} /> <code>/minemories select status</code>
				<T message={', then run'} /> <code>/minemories export selection</code>.<code> /minemories select clear</code>{' '}
				<T message={'clears the selection.'} />
			</p>
			<p>
				<T
					message={
						'The M key opens the Minemories menu. In simple mode, enter your gallery code, then click “Capture and upload”. The button becomes available when your account is connected and a world is open. If M is already assigned, change its shortcut in Minecraft controls.'
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
			<h2>
				<T message={'3. Find the file on your computer'} />
			</h2>
			<p>
				<T message={'The result is a file named'} /> <code>capture.glb</code> <T message={'in the folder'} />{' '}
				<code>export</code> <T message={'under your user directory ('} />
				<code>~/export/capture.glb</code>
				<T
					message={
						') by default, not in the world folder. In advanced mode, you can choose another folder and click “Export locally” without connecting an account. Here GLB means a 3D file containing shapes and textures. With the current mod version, every dated capture and its information are also kept in the subfolder'
					}
				/>{' '}
				<code>history</code>. <code>capture.glb</code>
				<T
					message={
						'points to the latest export. In the M menu, “Local captures” lets you choose and upload an older memory. Keep your own backups: the history takes up space on your computer.'
					}
				/>
			</p>
			<p>
				<T
					message={
						'To revisit it on the site, upload this memory from M → Local captures, then open it in your private gallery.'
					}
				/>
			</p>
			<h2>
				<T message={'4. Upload to your gallery, if you choose'} />
			</h2>
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
							'Generate a pairing code in the gallery. Pairing links this Minecraft installation to your Minemories account.'
						}
					/>
				</li>
				<li>
					<T message={'In Minecraft chat, enter'} /> <code>/minemories pair CODE</code>{' '}
					<T
						message={
							'replacing CODE with the six digits. The code expires after five minutes and can only be used once. Never type your password in Minecraft.'
						}
					/>
				</li>
				<li>
					<T message={'Enter'} /> <code>/minemories upload</code>{' '}
					<T
						message={
							'to upload the capture, then check that it appears in the gallery. The mod accepts files up to 450 MiB (about 472 MB). If the limit is exceeded, capture a smaller area.'
						}
					/>
				</li>
			</ol>
			<p>
				<T
					message={
						'AFK captures are enabled by default: after 5 minutes of inactivity, at most once every 4 hours, even in the pause menu or while Minecraft is in the background. Without a connected account, they stay in your local folder. With a connected account, they also upload to your private gallery. You can disable them in simple mode; advanced mode lets you adjust the delays and capture radius (32 blocks by default). A previously saved disable preference is preserved.'
					}
				/>
			</p>
			<h2>
				<T message={'Use your own API (advanced)'} />
			</h2>
			<p>
				<T message={'The mod uses'} /> <code>https://api.minemories.xenos.lightin.io</code>{' '}
				<T
					message={
						'by default. In “Advanced mode”, you can enter the HTTPS address of a compatible self-hosted Minemories API and an absolute path for the local folder, then click “Save”. HTTP is accepted only for an API on localhost. Changing API disconnects the account: generate a new code in the gallery belonging to that API. The “Minemories API” button restores the official address; save to apply it.'
					}
				/>
			</p>
			<h2>
				<T message={'5. Share only what you choose'} />
			</h2>
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
						'Before sharing, check the capture and its associated information: coordinates, server or world name, and single-player world seed may be recorded. Avoid places or text containing personal information and ask the other builders for permission.'
					}
				/>
			</p>
		</InfoPage>
	)
}

const questions = [
	[
		'Is this a backup of my world?',
		'No. It is a static 3D model of an area loaded in the game. It cannot resume your game. Keep your Minecraft backup separately.',
	],
	[
		'Do I need an account or mod to view a memory?',
		'A shared link opens without an account or mod. You need a Minemories account to upload to your private gallery.',
	],
	[
		'Can I keep a vanilla build?',
		'Yes, if you can open a copy of the Java 1.21.1 world with NeoForge 21.1.248 and Minemories. Vanilla means without mods: the profile used for capturing must still load the mod. Bedrock and consoles are not supported.',
	],
	[
		'Is it compatible with every mod?',
		'This is not guaranteed. Validated Java 1.21.1 targets are detailed on the Mod versions page: NeoForge, Fabric, Forge and Quilt using the Fabric JAR. Blocks with custom rendering may be incomplete. Try a small capture and inspect it before capturing your whole base.',
	],
	[
		'Do I need to install anything on the server?',
		"Minemories is a client mod on the player's computer, not a server plugin. Ask the admin for permission, keep the profile expected by the server and capture only permitted, loaded areas.",
	],
	[
		"Who can see my child's memories?",
		'The gallery is private by default. A link created with Share gives access to anyone who has it, and they can forward it. Check the memory and its information with your child before sharing. Revoking the link stops future access through it, not copies already made.',
	],
	[
		'Does the mod upload everything automatically?',
		'AFK captures are enabled by default after 5 minutes of inactivity, at most once every 4 hours, even while paused or in the background. Without a linked account they stay local; with one they upload to your private gallery. Simple mode can disable them; advanced mode adjusts delay, frequency and radius (32 blocks by default). A saved disable preference is preserved. Disconnecting the account stops uploads but keeps local captures. Export locally does not upload anything.',
	],
	[
		'How can I find an older capture?',
		'In the current mod version, M → Local captures lists dated captures kept in the history subfolder of your export directory. You can choose a memory and upload it if your account is connected. capture.glb remains the latest export. Older versions overwrote that file: updating preserves the remaining file but cannot recover files already overwritten. Local captures are not automatically deleted; allow enough space and keep your own backups. Lifetime online storage is not promised.',
	],
	[
		'Can I recover a closed server or import a ZIP?',
		'Not directly today. You must be able to reopen the world in a compatible environment to capture it. ZIP world imports and automatic recovery of old modpacks are not available.',
	],
	[
		'Why is part of the build missing?',
		"The mod captures an area and the elements loaded by the client. Move closer, check your selection's corners and height, reduce the area and try again. Some modded rendering may not be reproduced.",
	],
	[
		'The code does not work or uploading fails: what should I do?',
		'The six-digit code expires after five minutes and only works once: generate another in the gallery. Then check your connection and GLB size (450 MiB maximum from the mod). Keep the local file and retry the upload.',
	],
	[
		'Is there timelapse, 3D printing or a subscription?',
		"Timelapse links dated captures of the same area; 3D printing remains a future idea. This experimental version has no confirmed commercial offer or price. Do not rely on the project's old pricing scenarios.",
	],
]

export function FaqPage() {
	const { t } = useI18n()
	return (
		<InfoPage title="Frequently asked questions">
			<p>
				<T message={'New here? Start with'} />{' '}
				<Link to="/concept">
					<T message={'the concept'} />
				</Link>
				<T message={', then the'} />{' '}
				<Link to="/installation">
					<T message={'installation guide'} />
				</Link>
				<T message={'. Minecraft commands and filenames stay the same in both languages.'} />
			</p>
			{questions.map(([question, answer]) => (
				<section key={question}>
					<h2>{t(question ?? '')}</h2>
					<p>{t(answer ?? '')}</p>
				</section>
			))}
			<p>
				<Link to="/fonctionnement">
					<T message={'All the steps to capture, upload and share'} />
				</Link>
			</p>
			<p>
				<T
					message={
						'Minemories is an independent, unofficial project, neither approved by nor associated with Mojang or Microsoft.'
					}
				/>
			</p>
		</InfoPage>
	)
}
