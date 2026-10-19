export type Localized<T> = Record<'fr' | 'en', T>
export interface Article {
	slug: string
	published: string
	title: Localized<string>
	summary: Localized<string>
	sections: Array<{ heading: Localized<string>; body: Localized<string> }>
}
export const articles: Article[] = [
	{
		slug: 'premier-souvenir',
		published: '2026-10-14',
		title: { fr: 'Un premier souvenir, sans quitter ses repères', en: 'A first memory, with a familiar path' },
		summary: {
			fr: 'Du mod Minecraft au fichier 3D : ce que l’on garde, où le retrouver et comment commencer petit.',
			en: 'From the Minecraft mod to a 3D file: what a capture keeps, where to find it and why to start small.',
		},
		sections: [
			{
				heading: { fr: 'Un lieu, à un instant donné', en: 'A place at a moment in time' },
				body: {
					fr: 'Minemories capture les blocs d’une zone chargée dans Minecraft et produit un fichier GLB avec ses formes et ses textures. Tu peux revisiter ce lieu dans le navigateur. Cette capture ne remplace pas une sauvegarde du monde et ne permet pas de reprendre la partie.',
					en: 'Minemories captures blocks in a loaded Minecraft area and creates a GLB containing its shapes and textures. Revisit the place in your browser. A capture does not replace a world backup and cannot resume your game.',
				},
			},
			{
				heading: { fr: 'Commencer par une petite construction', en: 'Start with a small build' },
				body: {
					fr: 'La combinaison testée est Minecraft Java 1.21.1 et NeoForge 21.1.248. Dans un monde de test, attends que le terrain soit chargé, puis utilise /minemories export 16. Le rayon de 16 blocs permet de vérifier le rendu avant de capturer une grande base.',
					en: 'The tested combination is Minecraft Java 1.21.1 and NeoForge 21.1.248. In a test world, wait for terrain to load and use /minemories export 16. A 16-block radius lets you check the result before capturing a large base.',
				},
			},
			{
				heading: { fr: 'Garder le fichier, choisir le partage', en: 'Keep the file, choose whether to share' },
				body: {
					fr: 'Le fichier capture.glb se trouve par défaut dans le dossier export de ton dossier utilisateur. Pour l’envoyer dans ta galerie privée, relie le mod à ton compte. Les captures AFK sont actives par défaut et sont envoyées automatiquement après appairage ; tu peux les désactiver dans le menu M.',
					en: 'By default, capture.glb is in the export folder of your user directory. Pair the mod with your account to send captures to your private gallery. AFK captures are enabled by default and upload automatically after pairing; you can disable them in the M menu.',
				},
			},
		],
	},
]
export const legalContent = {
	privacy: {
		title: { fr: 'Tes souvenirs, tes choix', en: 'Your memories, your choices' },
		sections: [
			{
				heading: { fr: 'Préférences sur cet appareil', en: 'Preferences on this device' },
				body: {
					fr: 'Le tutoriel mémorise tes choix et ton prénom facultatif dans ton navigateur ; tu peux les effacer. Le choix de langue, les favoris/votes de démonstration et les estimations de prix gardées volontairement sont également enregistrés sur cet appareil. Réinitialiser la démo efface ses favoris et votes ; tu peux effacer les autres préférences dans les données du site de ton navigateur.',
					en: 'The tutorial stores your choices and optional name in your browser; you can clear them. Your language preference, demo favorites/votes and estimates you choose to save are also stored on this device. Reset demo clears its favorites and votes; clear other preferences in your browser’s site data.',
				},
			},
			{
				heading: { fr: 'Diagnostics web facultatifs', en: 'Optional web diagnostics' },
				body: {
					fr: 'Les diagnostics web sont désactivés par défaut. Si le déploiement configure Sentry, tu peux les autoriser puis retirer ton accord sur cette page, pour cet appareil. Seules des catégories fixes d’erreurs et les routes des pages éditoriales publiques sont transmises, sans messages bruts, compte, captures, codes ou URL privées. Les pages de connexion, galerie, viewer et partage sont exclues. Le serveur de réception voit l’adresse IP de la connexion ; sa région et sa conservation doivent être documentées avant activation du service.',
					en: 'Web diagnostics are off by default. If this deployment configures Sentry, you can allow them and withdraw consent on this page for this device. Only fixed error categories and public editorial page routes are transmitted, without raw messages, account details, captures, codes or private URLs. Sign-in, gallery, viewer and sharing pages are excluded. The receiving server sees the connection IP address; its region and retention must be documented before activating the service.',
				},
			},
			{
				heading: { fr: 'Compte et galerie', en: 'Account and gallery' },
				body: {
					fr: 'La connexion utilise un cookie de session. Les captures envoyées et leurs métadonnées sont associées à ton compte ; ta galerie est privée par défaut. Les avatars peuvent être chargés depuis un service externe. Après appairage, les captures AFK peuvent être envoyées automatiquement.',
					en: 'Sign-in uses a session cookie. Uploaded captures and their metadata belong to your account; the gallery is private by default. Avatars may load from an external service. After pairing, AFK captures can upload automatically.',
				},
			},
			{
				heading: { fr: 'Liens et suppression', en: 'Links and deletion' },
				body: {
					fr: 'Un lien de partage peut être retransmis et permet l’accès au souvenir sans compte. Sa révocation arrête les futurs accès, pas les copies déjà faites. La corbeille conserve les captures pendant 30 jours ; la suppression définitive permet de libérer l’espace après son traitement.',
					en: 'A shared link can be forwarded and gives access without an account. Revocation stops future access, not copies already made. Trash retains captures for 30 days; permanent deletion frees space once processed.',
				},
			},
		],
	},
	terms: {
		title: { fr: 'Utiliser Minemories', en: 'Using Minemories' },
		sections: [
			{
				heading: { fr: 'Une version expérimentale', en: 'An experimental version' },
				body: {
					fr: 'Conserve tes sauvegardes Minecraft et tes fichiers locaux. La compatibilité avec tous les modpacks, une disponibilité permanente et la conservation en ligne à vie ne sont pas garanties.',
					en: 'Keep your Minecraft backups and local files. Compatibility with every modpack, permanent availability and lifetime online storage are not guaranteed.',
				},
			},
			{
				heading: { fr: 'Capturer et partager', en: 'Capture and share' },
				body: {
					fr: 'Respecte les règles du serveur et les droits des personnes dont les constructions ou les informations figurent dans tes captures. Vérifie le contenu avant de créer un lien de partage.',
					en: 'Respect server rules and the rights of people whose builds or information appear in your captures. Check the contents before creating a shared link.',
				},
			},
		],
	},
	legal: {
		title: { fr: 'À propos de ce service', en: 'About this service' },
		sections: [
			{
				heading: { fr: 'Projet indépendant', en: 'Independent project' },
				body: {
					fr: 'Minemories est un projet indépendant, non officiel, non approuvé par Mojang ou Microsoft. Le code source et les versions du mod sont disponibles dans le dépôt public For-Hives/minemories.',
					en: 'Minemories is an independent, unofficial project, not endorsed by Mojang or Microsoft. Source code and mod releases are available in the public For-Hives/minemories repository.',
				},
			},
			{
				heading: { fr: 'Informations à compléter', en: 'Information to complete' },
				body: {
					fr: 'Les coordonnées juridiques de l’éditeur, de l’hébergeur et le contact dédié aux données personnelles restent à compléter avant le lancement commercial. Cette page décrit l’état du projet ; elle ne constitue pas des mentions légales finalisées.',
					en: 'Publisher and hosting details and the personal-data contact still need to be completed before commercial launch. This page describes the current project; it is not a finalized legal notice.',
				},
			},
		],
	},
}
