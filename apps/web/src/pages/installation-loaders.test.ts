import { expect, test } from 'vitest'
import { catalogLinks } from './installation-loaders'

test('the guide links to the real CurseForge and Modrinth project pages', () => {
	expect(catalogLinks()).toEqual([
		{ name: 'CurseForge', url: 'https://www.curseforge.com/minecraft/mc-mods/minemories' },
		{ name: 'Modrinth', url: 'https://modrinth.com/mod/minemories-3d' },
	])
})
