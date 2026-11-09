export const discoveryPages = [
	{
		path: '/open-source',
		label: 'Code we can share',
		title: 'A memory that does not depend on a black box.',
		lead: 'A mod, a GLB file and a public repository. See how it works, suggest an idea and keep a copy at home.',
		accent: 'mint',
		points: ['Source you can inspect', 'An open 3D format', 'Files that stay yours'],
		note: 'The code can be read on GitHub.',
	},
	{
		path: '/nostalgia',
		label: 'The places that matter',
		title: 'Remember our first house?',
		lead: 'The crooked roof. The shared chest. That path we took every evening. Keep a place, and everything it brings back.',
		accent: 'sunset',
		points: ['Revisit in your browser', 'Keep several moments', 'Pass on a memory'],
		note: 'A 3D memory keeps captured shapes and textures. It does not preserve the entire game or replace your Minecraft backup.',
	},
	{
		path: '/ranking',
		label: 'Builds to discover',
		title: 'Small worlds deserve their moment too.',
		lead: 'A cabin can tell as much as a megabase. Discover voluntarily published memories and the places visitors love.',
		accent: 'lilac',
		points: ['Discover by theme', 'Favorite a place', 'Try the ranking'],
		note: 'Memories stay private without an explicit submission; publications and votes can be withdrawn.',
	},
] satisfies Array<{
	path: string
	label: string
	title: string
	lead: string
	accent: string
	points: string[]
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
