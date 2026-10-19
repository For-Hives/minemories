export interface Article {
	slug: string
	published: string
	title: string
	summary: string
	sections: Array<{ heading: string; body: string }>
}
export const articles: Article[] = [
	{
		slug: 'premier-souvenir',
		published: '2026-10-14',
		title: 'A first memory, with a familiar path',
		summary: 'From the Minecraft mod to a 3D file: what a capture keeps, where to find it and why to start small.',
		sections: [
			{
				heading: 'A place at a moment in time',
				body: 'Minemories captures blocks in a loaded Minecraft area and creates a GLB containing its shapes and textures. Revisit the place in your browser. A capture does not replace a world backup and cannot resume your game.',
			},
			{
				heading: 'Start with a small build',
				body: 'The tested combination is Minecraft Java 1.21.1 and NeoForge 21.1.248. In a test world, wait for terrain to load and use /minemories export 16. A 16-block radius lets you check the result before capturing a large base.',
			},
			{
				heading: 'Keep the file, choose whether to share',
				body: 'By default, capture.glb is in the export folder of your user directory. Pair the mod with your account to send captures to your private gallery. AFK captures are enabled by default and upload automatically after pairing; you can disable them in the M menu.',
			},
		],
	},
]
export const legalContent = {
	privacy: {
		title: 'Your memories, your choices',
		sections: [
			{
				heading: 'Preferences on this device',
				body: 'The tutorial stores your choices and optional name in your browser; you can clear them. Your language preference, demo favorites/votes and estimates you choose to save are also stored on this device. Reset demo clears its favorites and votes; clear other preferences in your browser’s site data.',
			},
			{
				heading: 'Optional web diagnostics',
				body: 'Web diagnostics are off by default. If this deployment configures Sentry, you can allow them and withdraw consent on this page for this device. Only fixed error categories and public editorial page routes are transmitted, without raw messages, account details, captures, codes or private URLs. Sign-in, gallery, viewer and sharing pages are excluded. The receiving server sees the connection IP address; its region and retention must be documented before activating the service.',
			},
			{
				heading: 'Account and gallery',
				body: 'Sign-in uses a session cookie. Uploaded captures and their metadata belong to your account; the gallery is private by default. Avatars may load from an external service. After pairing, AFK captures can upload automatically.',
			},
			{
				heading: 'Links and deletion',
				body: 'A shared link can be forwarded and gives access without an account. Revocation stops future access, not copies already made. Trash retains captures for 30 days; permanent deletion frees space once processed.',
			},
		],
	},
	terms: {
		title: 'Using Minemories',
		sections: [
			{
				heading: 'An experimental version',
				body: 'Keep your Minecraft backups and local files. Compatibility with every modpack, permanent availability and lifetime online storage are not guaranteed.',
			},
			{
				heading: 'Capture and share',
				body: 'Respect server rules and the rights of people whose builds or information appear in your captures. Check the contents before creating a shared link.',
			},
		],
	},
	legal: {
		title: 'About this service',
		sections: [
			{
				heading: 'Independent project',
				body: 'Minemories is an independent, unofficial project, not endorsed by Mojang or Microsoft. Source code and mod releases are available in the public For-Hives/minemories repository.',
			},
			{
				heading: 'Information to complete',
				body: 'Publisher and hosting details and the personal-data contact still need to be completed before commercial launch. This page describes the current project; it is not a finalized legal notice.',
			},
		],
	},
}
