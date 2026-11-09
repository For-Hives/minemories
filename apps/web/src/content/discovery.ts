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
