import type { Localized } from './site-content.ts'

export const discoveryPages = [
	{
		path: '/open-source',
		label: { fr: 'Le code en commun', en: 'Code we can share' },
		title: {
			fr: 'Un souvenir qui ne dépend pas d’une boîte noire.',
			en: 'A memory that does not depend on a black box.',
		},
		lead: {
			fr: 'Un mod, un fichier GLB et un dépôt public. Regarde comment c’est fait, propose une idée et garde une copie chez toi.',
			en: 'A mod, a GLB file and a public repository. See how it works, suggest an idea and keep a copy at home.',
		},
		accent: 'mint',
		points: [
			{ fr: 'Du code consultable', en: 'Source you can inspect' },
			{ fr: 'Un format 3D ouvert', en: 'An open 3D format' },
			{ fr: 'Des fichiers qui restent à toi', en: 'Files that stay yours' },
		],
		story: {
			fr: 'Le dépôt contient le mod, le viewer et l’API. Les versions distribuées passent par GitHub Releases. Le GLB s’ouvre localement, sans compte : le cloud reste un choix.',
			en: 'The repository contains the mod, viewer and API. Distributed versions use GitHub Releases. Open a GLB locally without an account: the cloud remains a choice.',
		},
		note: {
			fr: 'L’ambition est open source. Le dépôt est public, mais une licence de redistribution reste à choisir ; sa visibilité seule n’accorde pas ces droits.',
			en: 'The ambition is open source. The repository is public, but a redistribution license still needs to be chosen; visibility alone does not grant those rights.',
		},
	},
	{
		path: '/nostalgie',
		label: { fr: 'Les lieux qui comptent', en: 'The places that matter' },
		title: { fr: 'Tu te souviens de notre première maison ?', en: 'Remember our first house?' },
		lead: {
			fr: 'Le toit un peu de travers. Le coffre partagé. Ce chemin qu’on prenait chaque soir. Garde un endroit, et tout ce qu’il te rappelle.',
			en: 'The crooked roof. The shared chest. That path we took every evening. Keep a place, and everything it brings back.',
		},
		accent: 'sunset',
		points: [
			{ fr: 'Revisiter dans le navigateur', en: 'Revisit in your browser' },
			{ fr: 'Garder plusieurs moments', en: 'Keep several moments' },
			{ fr: 'Transmettre un souvenir', en: 'Pass on a memory' },
		],
		story: {
			fr: 'Capture une petite zone depuis Minecraft, puis ouvre son fichier 3D. Des captures successives gardent différentes étapes de ta construction. L’illustration ci-dessous montre l’idée ; le timelapse automatique viendra plus tard.',
			en: 'Capture a small area in Minecraft, then open its 3D file. Successive captures preserve different stages of your build. The illustration below shows the idea; automatic timelapse comes later.',
		},
		note: {
			fr: 'Un souvenir 3D garde les formes et textures capturées. Il ne conserve pas toute la partie ni ne remplace ta sauvegarde Minecraft.',
			en: 'A 3D memory keeps captured shapes and textures. It does not preserve the entire game or replace your Minecraft backup.',
		},
	},
	{
		path: '/partager',
		label: { fr: 'Une galerie à partager', en: 'A gallery to share' },
		title: {
			fr: 'Fais visiter, même à ceux qui ne jouent plus.',
			en: 'Invite people back, even if they no longer play.',
		},
		lead: {
			fr: 'Pas besoin de relancer Minecraft pour montrer une construction. Un souvenir 3D, un lien choisi, et les autres peuvent se promener dedans.',
			en: 'No need to launch Minecraft to show a build. A 3D memory, a link you choose to share, and others can explore it.',
		},
		accent: 'sky',
		points: [
			{ fr: 'Une galerie privée au départ', en: 'A gallery that starts private' },
			{ fr: 'Un lien accessible sans compte', en: 'A link accessible without an account' },
			{ fr: 'Un partage que tu peux révoquer', en: 'Sharing you can revoke' },
		],
		story: {
			fr: 'Associe le mod à ton compte pour envoyer tes captures dans ta galerie. Choisis ensuite celles à partager. Un lien donne accès à son destinataire et peut être retransmis : vérifie ton souvenir avant de le diffuser.',
			en: 'Pair the mod with your account to upload captures to your gallery. Then choose which ones to share. A link gives its recipient access and can be forwarded: check your memory before sharing.',
		},
		note: {
			fr: 'L’explorateur de démonstration utilise des illustrations. Aucune capture privée n’y est publiée. La galerie publique communautaire est en préparation.',
			en: 'The demo explorer uses illustrations. No private captures are published there. The community public gallery is in preparation.',
		},
	},
	{
		path: '/classement',
		label: { fr: 'Des constructions à découvrir', en: 'Builds to discover' },
		title: { fr: 'Les petits mondes méritent aussi leur moment.', en: 'Small worlds deserve their moment too.' },
		lead: {
			fr: 'Une cabane peut raconter autant qu’une mégabase. Imagine un classement où l’on découvre des lieux, leurs détails et les histoires qu’ils gardent.',
			en: 'A cabin can tell as much as a megabase. Imagine a ranking where you discover places, their details and the stories they keep.',
		},
		accent: 'lilac',
		points: [
			{ fr: 'Découvrir par thème', en: 'Discover by theme' },
			{ fr: 'Mettre un lieu en favori', en: 'Favorite a place' },
			{ fr: 'Tester le classement', en: 'Try the ranking' },
		],
		story: {
			fr: 'Essaie le classement de démonstration : recherche un lieu et donne-lui un coup de cœur. Les votes et favoris restent sur cet appareil. La publication volontaire, les votes partagés et la modération seront reliés à l’API avant ouverture.',
			en: 'Try the demo ranking: search for a place and give it a heart. Votes and favorites stay on this device. Opt-in publishing, shared votes and moderation will connect to the API before opening.',
		},
		note: {
			fr: 'Les scores ci-dessous sont des exemples, pas une activité réelle de la communauté. Chaque vote local peut être retiré.',
			en: 'The scores below are examples, not real community activity. Each local vote can be removed.',
		},
	},
] satisfies Array<{
	path: string
	label: Localized<string>
	title: Localized<string>
	lead: Localized<string>
	accent: string
	points: Localized<string>[]
	story: Localized<string>
	note: Localized<string>
}>

export type DemoTheme = 'home' | 'village' | 'garden'
export const demoMemories = [
	{
		id: 'premiere-maison',
		theme: 'home' as DemoTheme,
		title: { fr: 'Notre première maison', en: 'Our first house' },
		category: { fr: 'Entre amis', en: 'With friends' },
		story: {
			fr: 'Une petite maison, trois coffres et beaucoup de plans pour la suite.',
			en: 'A small house, three chests and plenty of plans for what came next.',
		},
		hearts: 24,
	},
	{
		id: 'village-riviere',
		theme: 'village' as DemoTheme,
		title: { fr: 'Le village au bord de l’eau', en: 'The riverside village' },
		category: { fr: 'Construction', en: 'Builds' },
		story: {
			fr: 'Chaque toit a été ajouté lors d’une soirée différente.',
			en: 'Every roof was added on a different evening.',
		},
		hearts: 42,
	},
	{
		id: 'jardin-secret',
		theme: 'garden' as DemoTheme,
		title: { fr: 'Le jardin des détours', en: 'The winding garden' },
		category: { fr: 'Exploration', en: 'Exploration' },
		story: {
			fr: 'Un endroit où l’on venait juste regarder le soleil se coucher.',
			en: 'A place we visited just to watch the sun go down.',
		},
		hearts: 31,
	},
]
