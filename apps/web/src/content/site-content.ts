export type ArticleVisual =
	| { kind: 'scene'; theme: 'home' | 'village' | 'garden' }
	| { kind: 'radius' }
	| { kind: 'files' }
export interface Article {
	slug: string
	published: string
	title: string
	summary: string
	sections: Array<{ heading: string; body: string; visual: ArticleVisual }>
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
				body: 'A capture is a 3D snapshot of the loaded area. You can look around, not resume the game.',
				visual: { kind: 'scene', theme: 'home' },
			},
			{
				heading: 'Start with a small build',
				body: 'Wait for the terrain to load, then type this in chat. A 16-block radius is easy to check.',
				visual: { kind: 'radius' },
			},
			{
				heading: 'Keep the file, choose whether to share',
				body: 'The capture lands in your export folder. Pair the mod to send captures to your private gallery.',
				visual: { kind: 'files' },
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
				body: 'Web diagnostics are off by default. When they are available, a switch on this page lets you allow them and withdraw consent for this device. Only fixed error categories and public editorial page routes are transmitted, without raw messages, account details, captures, codes or private URLs. Sign-in, gallery, viewer and sharing pages are excluded. The receiving server sees the connection IP address.',
			},
			{
				heading: 'Diagnostics in the Minecraft mod',
				body: "Technical diagnostics in the mod are on by default, but nothing is ever sent before you pair the game with your account. An explicit refusal is kept, even after pairing, disconnecting or changing API. Reports are sanitized: versions, the failed step and a short technical trace, without raw messages, full crash logs, URLs, local paths, credentials, coordinates, seeds, world, player or server names, or capture contents. The mod keeps at most eight pending reports, for at most seven days. Turning diagnostics off or changing account or API purges this queue; turning them off also asks the server to delete this device's reports, and if it cannot be reached, its retention applies. Turn them off in M → Settings → Privacy → Diagnostics.",
			},
			{
				heading: 'Account and gallery',
				body: 'Sign-in uses a session cookie. Uploaded captures and their metadata belong to your account; the gallery is private by default. Avatars may load from an external service. After pairing, AFK captures can upload automatically.',
			},
			{
				heading: 'Links and deletion',
				body: 'A shared link can be forwarded and gives access without an account. Revocation stops future access, not copies already made. Trash retains captures for 30 days; permanent deletion frees space once processed.',
			},
			{
				heading: 'Mod download list',
				body: 'The installation, mod versions and changelog pages load the list of available mod files from the Minemories API, directly from your browser, which receives your IP address like any request to the service. JAR downloads also come from the Minemories API, without an account or cookie.',
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
		title: 'Legal notice',
		sections: [
			{
				heading: 'Independent project',
				body: 'Minemories is an independent, unofficial project, not endorsed by Mojang or Microsoft. The source code is public on GitHub; the mod is downloaded from the Downloads page.',
			},
			{
				heading: 'Information to complete',
				body: 'This page does not list the publisher, the host or a personal-data contact yet. It describes the current project; it is not a finalized legal notice.',
			},
		],
	},
}
