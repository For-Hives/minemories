import { supportedMinecraft } from '../pages/mod-targets'

/**
 * Every question the site answers, written once: the /faq list, the questions shown on other pages and the FAQPage
 * JSON-LD all read them from here. Questions and answers are catalogue keys (English source text); an answer is a
 * list of sentences, at most three. The record keys are the anchors of /faq (`/faq#ban`): stable, never derived
 * from a translation. Questions that wait for an owner decision (price, licence for modpacks, performance figures)
 * are not written yet.
 */
export interface FaqEntry {
	question: string
	answer: string[]
	/** Interpolated into the answer's sentences (catalogue `{name}` parameters). */
	values?: Record<string, string>
	/** A page that says more, shown after the answer. */
	link?: { to: string; label: string }
}

function versionsAnswer(): FaqEntry {
	const { versions, experimental } = supportedMinecraft()
	return {
		question: 'Which versions?',
		answer: [
			experimental
				? 'In beta: Minecraft Java {versions}, plus {experimental} as an experimental version.'
				: 'In beta: Minecraft Java {versions}.',
			'The most tested is 1.21.1.',
			'1.12.2 and 1.16.5: not yet.',
		],
		values: { versions, experimental },
		link: { to: '/downloads', label: 'Downloads' },
	}
}

export const questions = {
	bedrock: {
		question: 'Does it work on Bedrock, consoles or phones?',
		answer: ['No, only Minecraft Java on a computer.'],
	},
	versions: versionsAnswer(),
	ban: {
		question: 'Can I get banned?',
		answer: [
			'The mod runs only in your game and sends nothing to the game server: it reads what your game shows, like a screenshot.',
			'Some servers ban any mod that isn’t on their list: check their rules.',
		],
	},
	virus: {
		question: 'Is it a virus?',
		answer: [
			'No. It’s a .jar file for Minecraft: only download it from this site or our CurseForge page.',
			'Its SHA-256 checksum is shown on the downloads page.',
		],
		link: { to: '/safety#verifier', label: 'Check your file' },
	},
	sauvegarde: {
		question: 'Does it back up my world?',
		answer: ['No. It’s a 3D copy to look at, not to play in.', 'Keep your Minecraft backup too.'],
	},
	minemories: {
		question: 'What is Minemories?',
		answer: [
			'A Minecraft Java mod that keeps a 3D copy of the area around you.',
			'Open it in your browser and share it with a link.',
		],
		link: { to: '/concept', label: 'The concept' },
	},
	bluemap: {
		question: 'How is it different from BlueMap?',
		answer: [
			'BlueMap maps a whole server and is installed on the server.',
			'Minemories keeps one spot, from your own game, without asking the admin.',
		],
	},
	litematica: {
		question: 'Isn’t it just Litematica?',
		answer: [
			'No. Litematica saves the blocks of a build so you can rebuild it block by block, and you open it in Minecraft with the mod.',
			'Minemories keeps what your build looks like, textures and lights included, and you walk around it in your browser, without Minecraft.',
			'One is for copying a base, the other for revisiting it and showing it off: they go well together.',
		],
	},
	rejouer: {
		question: 'Can I play in it again?',
		answer: ['No. To play again, keep your world save.'],
	},
	'si-minemories-ferme': {
		question: 'What if Minemories shuts down?',
		answer: [
			'Your memories also stay on your computer, in the export folder, and every memory in your gallery downloads as a GLB file.',
			'You don’t depend on us.',
		],
	},
	qui: {
		question: 'Who makes Minemories?',
		answer: ['An independent project by For-Hives (Bréval and Andy), with no link to Mojang or Microsoft.'],
	},
	loader: {
		question: 'Which loader?',
		answer: [
			'Fabric, Forge or NeoForge, depending on your version.',
			'On Fabric, add Fabric API.',
			'In 1.21.1, Quilt works with the Fabric JAR.',
		],
		link: { to: '/downloads', label: 'Downloads' },
	},
	launcher: {
		question: 'Which launcher?',
		answer: [
			'The CurseForge app is the simplest: it adds Fabric API on its own.',
			'Otherwise, Prism Launcher, or the official launcher with your loader’s installer.',
		],
		link: { to: '/installation', label: 'Install the mod' },
	},
	serveur: {
		question: 'Do I need to install anything on the server?',
		answer: ['No, it’s client-side: it only goes on the player’s computer.'],
	},
	'tout-le-monde': {
		question: 'Does everyone need to install it?',
		answer: ['No. One person is enough to capture the group’s base.', 'The others just open the link.'],
	},
	'monde-modifie': {
		question: 'Does it change my world?',
		answer: ['No. The mod reads what your game shows and writes a separate file.'],
	},
	compte: {
		question: 'Do I need an account?',
		answer: [
			'To revisit your memory in 3D in the browser, yes.',
			'Without an account, it stays as a GLB file on your computer, to open in Blender.',
		],
		link: { to: '/guides/minecraft-blender', label: 'Open my build in Blender' },
	},
	sodium: {
		question: 'Does it work with Sodium, Iris or shaders?',
		answer: [
			'Tested with Sodium and Iris in 1.21.1.',
			'The memory keeps the blocks and their textures, not the shader effect.',
			'OptiFine is not tested.',
		],
	},
	'prendre-un-souvenir': {
		question: 'How do I take a memory?',
		answer: [
			'Press M → Take a memory.',
			'Otherwise, the mod takes one on its own when you stay AFK for 5 minutes, even with the game paused (at most one every 4 hours).',
		],
	},
	taille: {
		question: 'How big is the area?',
		answer: [
			'About 32 blocks around you, adjusted to what you built.',
			'For a big base: M → the gear next to Take a memory → Memory size.',
		],
	},
	'sous-sols': {
		question: 'Are basements included?',
		answer: [
			'Yes, down to 5 blocks below the lowest point you visited, and further down if a build is connected to it.',
			'And it’s adjustable: M → the gear next to Take a memory → Memory size → Depth below you.',
		],
	},
	mods: {
		question: 'Does it work with my mods?',
		answer: [
			'Tested with Create, Mekanism and Cobblemon in 1.21.1.',
			'Some blocks with special rendering may be missing: take a small test memory first.',
		],
	},
	joueurs: {
		question: 'Do players nearby show up?',
		answer: ['Yes, frozen with their skin, like the animals.', 'Ask them before you share.'],
	},
	'souvenirs-auto': {
		question: 'Can I turn off auto memories?',
		answer: ['Yes: M → Auto memories.'],
	},
	'ou-sont-mes-souvenirs': {
		question: 'Where are my memories?',
		answer: [
			'In the game: M → My memories.',
			'The files are in the export folder of your home folder (for example C:\\Users\\<you>\\export).',
			'You can change it in M → Settings → Memories.',
		],
	},
	'vieux-monde': {
		question: 'Server already gone?',
		answer: [
			'Without a copy of the world, there’s nothing left to capture.',
			'If you have the world as a ZIP, open it in single player in a compatible version and take your memory there.',
		],
		link: { to: '/server-closing', label: 'What if my server shuts down?' },
	},
	'sur-un-serveur': {
		question: 'Does it work on a server?',
		answer: ['Yes, it captures what your game shows.', 'Follow the server’s rules.'],
	},
	connecter: {
		question: 'How do I connect the game?',
		answer: [
			'On the site, open your gallery and get a code.',
			'In Minecraft: M → type the code → Connect.',
			'The code lasts 5 minutes and works once.',
		],
		link: { to: '/gallery', label: 'My gallery' },
	},
	'souvenirs-d-avant': {
		question: 'What about memories taken before I connected?',
		answer: ['M → My memories → Send this memory.'],
	},
	'regarder-un-lien': {
		question: 'Do I need Minecraft or an account to view a link?',
		answer: ['No, a browser is enough.'],
	},
	'ce-que-voit-le-lien': {
		question: 'What does someone with my link see?',
		answer: [
			'The 3D scene, its name and its date.',
			'The link also shows the coordinates, the dimension, the biome, the world name, the seed (in single player) or the server name or address.',
		],
	},
	'arreter-le-partage': {
		question: 'Can I stop sharing?',
		answer: ['Yes, in your gallery: Stop sharing.', 'It blocks new visits, not a copy already made.'],
	},
	'galerie-publique': {
		question: 'How do I publish in the public gallery?',
		answer: ['Pick a memory → Publish in the public gallery.', 'We review it before it appears.'],
		link: { to: '/explore', label: 'Public gallery' },
	},
	droit: {
		question: 'Am I allowed to?',
		answer: ['For yourself, yes.', 'To share or publish someone else’s base, ask them first.'],
	},
	fichier: {
		question: 'Can I get the file back?',
		answer: ['Yes, every memory in your gallery downloads as a GLB file, and the viewer makes HD postcards.'],
	},
	place: {
		question: 'How much space?',
		answer: ['2 GiB per account during the beta.', 'The trash counts too.'],
	},
	'envoi-automatique': {
		question: 'Does the mod upload everything on its own?',
		answer: [
			'Nothing is sent until you connect the game.',
			'After that, your memories go to your private gallery, with cleaned-up error reports you can turn off in M → Settings → Privacy.',
		],
		link: { to: '/privacy', label: 'Privacy' },
	},
	enfant: {
		question: 'Who can see my kid’s memories?',
		answer: [
			'Nobody, by default.',
			'Only people with a link your kid created, or everyone if they publish a memory and it’s accepted after review.',
		],
		link: { to: '/safety', label: 'Is it safe?' },
	},
	'tout-supprimer': {
		question: 'How do I delete everything?',
		answer: [
			'A memory: from your gallery (30 days in the trash).',
			'Your account: write to us, the contact address is coming soon.',
			'We then delete the account, its memories, its links and its devices.',
		],
	},
	code: {
		question: 'The code doesn’t work?',
		answer: ['It expires after 5 minutes and works only once.', 'Generate another one.', 'Your local file is safe.'],
	},
	plantage: {
		question: 'The game crashes on launch?',
		answer: ['Check that the JAR matches your version and your loader, and that Fabric API is there on Fabric.'],
	},
	'touche-m': {
		question: 'M opens something else?',
		answer: [
			'Another mod uses M.',
			'Go through Options → Minemories, or change the key in Options → Controls → Key Binds.',
		],
	},
	'partie-manquante': {
		question: 'Part of the build is missing?',
		answer: ['Move closer, make the memory bigger, or select an area between two corners.'],
	},
	'mot-de-passe': {
		question: 'Forgot your password?',
		answer: ['There’s no automatic reset yet.', 'Write to us: the contact address is coming soon.'],
	},
} satisfies Record<string, FaqEntry>

export type QuestionId = keyof typeof questions

/** The /faq page: questions asked before installing come first. */
export const faqGroups: Array<{ label: string; ids: QuestionId[] }> = [
	{ label: 'Before installing', ids: ['bedrock', 'versions', 'ban', 'virus', 'sauvegarde'] },
	{ label: 'The mod', ids: ['minemories', 'bluemap', 'litematica', 'si-minemories-ferme', 'qui'] },
	{
		label: 'Installing',
		ids: ['loader', 'launcher', 'serveur', 'tout-le-monde', 'monde-modifie', 'compte', 'sodium'],
	},
	{
		label: 'Capturing',
		ids: [
			'prendre-un-souvenir',
			'taille',
			'sous-sols',
			'mods',
			'joueurs',
			'souvenirs-auto',
			'ou-sont-mes-souvenirs',
			'vieux-monde',
			'sur-un-serveur',
		],
	},
	{
		label: 'Gallery and sharing',
		ids: [
			'connecter',
			'souvenirs-d-avant',
			'regarder-un-lien',
			'ce-que-voit-le-lien',
			'arreter-le-partage',
			'galerie-publique',
			'droit',
			'fichier',
			'place',
		],
	},
	{ label: 'Safety and privacy', ids: ['envoi-automatique', 'enfant', 'tout-supprimer'] },
	{ label: 'Problems', ids: ['code', 'plantage', 'touche-m', 'partie-manquante', 'mot-de-passe'] },
]

/** The three questions (at most) a page other than /faq shows. */
export const pageQuestions = {
	home: ['serveur', 'litematica', 'si-minemories-ferme'],
	concept: ['bluemap', 'rejouer', 'sous-sols'],
	howItWorks: ['envoi-automatique', 'souvenirs-auto'],
	installation: ['plantage', 'code', 'touche-m'],
	downloads: ['bedrock', 'versions'],
	serverClosing: ['tout-le-monde', 'vieux-monde', 'droit'],
	blender: ['mods', 'sur-un-serveur'],
	sharing: ['regarder-un-lien', 'arreter-le-partage', 'galerie-publique'],
} satisfies Record<string, QuestionId[]>

/** One question, its answer as one paragraph, in the given translation. */
export function faqText(id: QuestionId, translate: (message: string, values?: Record<string, string>) => string) {
	const entry: FaqEntry = questions[id]
	return {
		question: translate(entry.question),
		answer: entry.answer.map(sentence => translate(sentence, entry.values)).join(' '),
	}
}
