import type { StepId } from '../lib/install-guide'
import { mostTestedMinecraft, quiltTested, supportedMinecraft } from '../pages/mod-targets'

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
			'The most tested is {mostTested}.',
			'1.12.2 and 1.16.5: not yet.',
		],
		values: { versions, experimental, mostTested: mostTestedMinecraft },
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
			'The mod runs only in your game and sends nothing to the server.',
			'Some servers ban every mod that isn’t on their list: check their rules.',
		],
	},
	virus: {
		question: 'Is it a virus?',
		answer: ['No. Only download it from this site or our CurseForge page.'],
		link: { to: '/safety#verifier', label: 'Check your file' },
	},
	sauvegarde: {
		question: 'Does it back up my world?',
		answer: [
			'No. It writes a separate 3D copy to look at and never touches your world.',
			'Keep your Minecraft backup too.',
		],
	},
	minemories: {
		question: 'What is Minemories?',
		answer: ['A Minecraft Java mod that saves the area around you in 3D, to walk around in your browser.'],
		link: { to: '/concept', label: 'The concept' },
	},
	bluemap: {
		question: 'How is it different from BlueMap?',
		answer: [
			'BlueMap maps a whole server and is installed on the server.',
			'Minemories keeps one spot, from your own game, without the admin.',
		],
	},
	litematica: {
		question: 'Isn’t it just Litematica?',
		answer: [
			'No. Litematica saves the blocks, so you can rebuild.',
			'Minemories saves the look, so you can walk around it in your browser.',
			'The two go well together.',
		],
	},
	'si-minemories-ferme': {
		question: 'What if Minemories shuts down?',
		answer: [
			'Your memories also stay on your computer, and you can download each one from your gallery.',
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
			'In {minecraft}, Quilt works with the Fabric file.',
		],
		values: { minecraft: quiltTested.minecraft },
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
		answer: ['No. It only goes on your computer, and it works on any server.'],
	},
	'tout-le-monde': {
		question: 'Does everyone need to install it?',
		answer: ['No. One person is enough to capture the group’s base.', 'The others just open the link.'],
	},

	compte: {
		question: 'Do I need an account?',
		answer: [
			'To walk around your memory in the browser, yes.',
			'Without one, the file stays on your computer and opens in Blender.',
		],
		link: { to: '/guides/minecraft-blender', label: 'Open my build in Blender' },
	},
	sodium: {
		question: 'Does it work with Sodium, Iris or shaders?',
		answer: [
			'Sodium and Iris, yes (tested in 1.21.1), but the memory doesn’t keep the shader effect.',
			'OptiFine isn’t tested.',
		],
	},
	'prendre-un-souvenir': {
		question: 'How do I take a memory?',
		answer: [
			'Press M → Take a memory.',
			'Or stay AFK for 5 minutes, even paused: the mod takes one for you, at most every 4 hours.',
		],
	},
	taille: {
		question: 'How big is the area?',
		answer: ['About 32 blocks around you, adjusted to what you built.', 'For a big base: M → the gear → Memory size.'],
	},
	'sous-sols': {
		question: 'Are basements included?',
		answer: [
			'Yes, 5 blocks below the lowest point you visited, and more if a build goes deeper.',
			'Adjust it in M → the gear → Memory size → Depth below you.',
		],
	},
	mods: {
		question: 'Does it work with my mods?',
		answer: [
			'Tested with Create, Mekanism and Cobblemon in 1.21.1.',
			'Some blocks with unusual rendering may be missing, so take a small test memory first.',
		],
	},
	joueurs: {
		question: 'Do players nearby show up?',
		answer: ['Yes, frozen with their skin, like the animals.', 'Ask them before you share.'],
	},
	'souvenirs-auto': {
		question: 'Can I turn off AFK captures?',
		answer: ['Yes: M → Auto memories.'],
	},
	'ou-sont-mes-souvenirs': {
		question: 'Where are my memories?',
		answer: [
			'In the game: M → My memories.',
			'The files are in the export folder of your home folder (for example C:\\Users\\<you>\\export).',
		],
	},
	'vieux-monde': {
		question: 'Server already gone?',
		answer: [
			'If you have the world as a ZIP, open it in single player and take your memory there.',
			'Without a copy, there’s nothing left to capture.',
		],
		link: { to: '/server-closing', label: 'Server shutting down?' },
	},
	connecter: {
		question: 'How do I connect the game?',
		answer: ['Open your gallery on the site and get a code.', 'In Minecraft: M → type the code → Connect.'],
		link: { to: '/gallery', label: 'My gallery' },
	},
	'souvenirs-d-avant': {
		question: 'What about memories taken before I connected?',
		answer: ['M → My memories → Send this memory.'],
	},

	'ce-que-voit-le-lien': {
		question: 'What does someone with my link see?',
		answer: [
			'Your base in 3D, its name and its date.',
			'Also the coordinates, dimension, biome and world name, plus the seed in single player or the server’s name and address.',
		],
	},
	'arreter-le-partage': {
		question: 'Can I stop sharing?',
		answer: ['Yes, in your gallery: Stop sharing.', 'It blocks new visits, not a copy already made.'],
	},
	'galerie-publique': {
		question: 'How do I make a memory public?',
		answer: ['Open a memory in your gallery → Make public.', 'We check it before it shows up.'],
		link: { to: '/explore', label: 'Public gallery' },
	},
	droit: {
		question: 'Am I allowed to?',
		answer: ['For yourself, yes.', 'To share or publish someone else’s base, ask them first.'],
	},
	fichier: {
		question: 'Can I get the file back?',
		answer: ['Yes. Download any memory from your gallery to open it in Blender.', 'You can also save HD postcards.'],
	},
	place: {
		question: 'How much space?',
		answer: ['2 GiB per account during the beta.', 'The trash counts too.'],
	},
	'envoi-automatique': {
		question: 'Does the mod send my memories without asking?',
		answer: [
			'Nothing is sent until you connect the game.',
			'After that, your memories go to your private gallery.',
			'Error reports, with nothing personal, turn off in M → Settings → Privacy.',
		],
		link: { to: '/privacy', label: 'Privacy' },
	},
	enfant: {
		question: 'Who can see my kid’s memories?',
		answer: [
			'Nobody, by default.',
			'Only people with a link from your kid, or everyone if your kid makes a memory public and we accept it.',
		],
		link: { to: '/safety', label: 'Safety' },
	},
	'tout-supprimer': {
		question: 'How do I delete everything?',
		answer: [
			'A memory: from your gallery. It stays 30 days in the trash.',
			'Your account: write to us through the legal notice, and we delete everything.',
		],
		link: { to: '/legal', label: 'Legal notice' },
	},
	code: {
		question: 'The code doesn’t work?',
		answer: ['It lasts 5 minutes and works only once.', 'Get a new one in your gallery.'],
	},
	installeur: {
		question: 'The loader installer won’t open?',
		answer: [
			'It needs Java: install Temurin, then right-click the installer → Open with → Java.',
			'On macOS or Linux, type java -jar and the file name in a terminal.',
			'Don’t turn off your security to run it.',
		],
	},
	'mod-absent': {
		question: 'The mod doesn’t show up?',
		answer: [
			'The file must end in .jar, not .jar.zip, and sit in mods, not in saves.',
			'Launch the profile of the loader you picked, in the same Minecraft version.',
		],
	},
	plantage: {
		question: 'The game crashes on launch?',
		answer: [
			'Check that the mod file matches your version and loader, with Fabric API on Fabric.',
			'To undo, take it out of mods. Never delete your world.',
		],
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
		answer: ['On the sign-in page, choose “Forgot your password?”.'],
		link: { to: '/login/forgot', label: 'Choose a new password' },
	},
} satisfies Record<string, FaqEntry>

export type QuestionId = keyof typeof questions

/** The anchor of a /faq group (`/faq#sharing`): stable, never derived from a translation, distinct from every question's. */
export type FaqGroupId =
	| 'before-installing'
	| 'the-mod'
	| 'installing'
	| 'capturing'
	| 'sharing'
	| 'safety'
	| 'problems'

/** The /faq page: questions asked before installing come first. */
export const faqGroups: Array<{ id: FaqGroupId; label: string; ids: QuestionId[] }> = [
	{
		id: 'before-installing',
		label: 'Before installing',
		ids: ['bedrock', 'versions', 'ban', 'virus', 'sauvegarde'],
	},
	{ id: 'the-mod', label: 'The mod', ids: ['minemories', 'bluemap', 'litematica', 'si-minemories-ferme', 'qui'] },
	{
		id: 'installing',
		label: 'Installing',
		ids: ['loader', 'launcher', 'serveur', 'tout-le-monde', 'compte', 'sodium'],
	},
	{
		id: 'capturing',
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
		],
	},
	{
		id: 'sharing',
		label: 'Gallery and sharing',
		ids: [
			'connecter',
			'souvenirs-d-avant',
			'ce-que-voit-le-lien',
			'arreter-le-partage',
			'galerie-publique',
			'droit',
			'fichier',
			'place',
		],
	},
	{ id: 'safety', label: 'Safety and privacy', ids: ['envoi-automatique', 'enfant', 'tout-supprimer'] },
	{
		id: 'problems',
		label: 'Problems',
		ids: ['installeur', 'mod-absent', 'plantage', 'touche-m', 'code', 'partie-manquante', 'mot-de-passe'],
	},
]

/**
 * /installation's "If a step gets stuck": what can break during the install, in the order it can happen. The guide
 * shows the items of the current screen first (`installationHelpByStep`), then the others.
 */
export const installationHelp = [
	'installeur',
	'mod-absent',
	'touche-m',
	'plantage',
	'code',
	'partie-manquante',
] as const satisfies readonly QuestionId[]
export const installationHelpByStep: Partial<Record<StepId, readonly (typeof installationHelp)[number][]>> = {
	version: ['plantage'],
	loader: ['plantage'],
	'loader-install': ['installeur', 'plantage'],
	app: ['mod-absent', 'plantage'],
	download: ['mod-absent'],
	place: ['mod-absent', 'plantage'],
	check: ['touche-m', 'mod-absent', 'plantage'],
	connect: ['code'],
	memory: ['partie-manquante', 'code'],
}

/** The short warning every page that offers a link shows; the full list of what a link shows is the FAQ's (`/faq#ce-que-voit-le-lien`). */
export const linkWarning = 'The link shows where your base is, and on which server. Think before posting it in public.'

/** The three questions the landing shows. The other pages answer nothing themselves: they link to their group of /faq (`pageFaqGroups`). */
export const pageQuestions = {
	home: ['serveur', 'litematica', 'si-minemories-ferme'],
} satisfies Record<string, QuestionId[]>

/** The /faq group a guide page links to at its end, written once here so that the anchor and the group stay together. */
export const pageFaqGroups = {
	concept: 'the-mod',
	howItWorks: 'capturing',
	downloads: 'before-installing',
	serverClosing: 'capturing',
	blender: 'capturing',
	sharing: 'sharing',
} satisfies Record<string, FaqGroupId>

/** One question, its answer as one paragraph, in the given translation. */
export function faqText(id: QuestionId, translate: (message: string, values?: Record<string, string>) => string) {
	const entry: FaqEntry = questions[id]
	return {
		question: translate(entry.question),
		answer: entry.answer.map(sentence => translate(sentence, entry.values)).join(' '),
	}
}
