export const discoveryPages = [
	{
		path: '/open-source',
		label: 'Code we can share',
		title: 'A memory that does not depend on a black box.',
		lead: 'A mod, a GLB file and a public repository. See how it works, suggest an idea and keep a copy at home.',
		accent: 'mint',
		points: ['Source you can inspect', 'An open 3D format', 'Files that stay yours'],
		story:
			'The repository contains the mod, viewer and API. Distributed versions use GitHub Releases. Captures appear in your private gallery after pairing the mod. Shared links can be viewed without an account.',
		note: 'The ambition is open source. The repository is public, but a redistribution license still needs to be chosen; visibility alone does not grant those rights.',
	},
	{
		path: '/nostalgie',
		label: 'The places that matter',
		title: 'Remember our first house?',
		lead: 'The crooked roof. The shared chest. That path we took every evening. Keep a place, and everything it brings back.',
		accent: 'sunset',
		points: ['Revisit in your browser', 'Keep several moments', 'Pass on a memory'],
		story:
			'Capture a small area in Minecraft, then open its 3D file. Successive captures preserve different stages of your build. The illustration below shows the idea; automatic timelapse comes later.',
		note: 'A 3D memory keeps captured shapes and textures. It does not preserve the entire game or replace your Minecraft backup.',
	},
	{
		path: '/partager',
		label: 'A gallery to share',
		title: 'Invite people back, even if they no longer play.',
		lead: 'No need to launch Minecraft to show a build. A 3D memory, a link you choose to share, and others can explore it.',
		accent: 'sky',
		points: ['A gallery that starts private', 'A link accessible without an account', 'Sharing you can revoke'],
		story:
			'Pair the mod with your account to upload captures to your gallery. Then choose which ones to share. A link gives its recipient access and can be forwarded: check your memory before sharing.',
		note: 'The demo explorer uses illustrations. No private captures are published there. The community public gallery is in preparation.',
	},
	{
		path: '/classement',
		label: 'Builds to discover',
		title: 'Small worlds deserve their moment too.',
		lead: 'A cabin can tell as much as a megabase. Discover voluntarily published memories and the places visitors love.',
		accent: 'lilac',
		points: ['Discover by theme', 'Favorite a place', 'Try the ranking'],
		story:
			'The ranking shows memories approved by moderation. Sign in to add or remove your vote. A separate demo remains available to try favorites and local votes.',
		note: 'Memories stay private without an explicit submission; publications and votes can be withdrawn.',
	},
] satisfies Array<{
	path: string
	label: string
	title: string
	lead: string
	accent: string
	points: string[]
	story: string
	note: string
}>

export type DemoTheme = 'home' | 'village' | 'garden'
export const demoMemories = [
	{
		id: 'premiere-maison',
		theme: 'home' as DemoTheme,
		title: 'Our first house',
		category: 'With friends',
		story: 'A small house, three chests and plenty of plans for what came next.',
		hearts: 24,
	},
	{
		id: 'village-riviere',
		theme: 'village' as DemoTheme,
		title: 'The riverside village',
		category: 'Builds',
		story: 'Every roof was added on a different evening.',
		hearts: 42,
	},
	{
		id: 'jardin-secret',
		theme: 'garden' as DemoTheme,
		title: 'The winding garden',
		category: 'Exploration',
		story: 'A place we visited just to watch the sun go down.',
		hearts: 31,
	},
]
