import { expect, test } from 'vitest'
import { metadataFor, publicMetadata } from '../route-metadata'
import { structuredDataFor } from '../structured-data'

test('the public pages are listed in English and every page has translated metadata on the same path', () => {
	for (const page of publicMetadata) {
		const english = metadataFor(page.path, 'en')
		const french = metadataFor(page.path, 'fr')
		expect(english).toEqual(page)
		expect(english.language).toBe('en')
		expect(french.title).not.toBe(page.title)
		expect(french.description).not.toBe(page.description)
		expect(structuredDataFor(english)['@graph'][0]?.inLanguage).toBe('en')
		expect(metadataFor(page.path, 'fr').language).toBe('fr')
	}
	expect(metadataFor('/installation/', 'en').title).toBe('Install Minemories on Fabric, Forge or NeoForge')
	expect(metadataFor('/share/private-token', 'en')).toMatchObject({
		indexable: false,
		language: 'en',
		title: 'A Minecraft place in 3D, shared with you',
	})
})

test('sign-in and registration pages have their own title but stay private', () => {
	expect(metadataFor('/login', 'fr')).toMatchObject({ title: 'Connexion · Minemories', indexable: false })
	expect(metadataFor('/register/', 'fr')).toMatchObject({ title: 'Créer un compte · Minemories', indexable: false })
	expect(metadataFor('/login', 'en').title).toBe('Sign in · Minemories')
	expect(publicMetadata.some(page => page.path === '/login' || page.path === '/register')).toBe(false)
})
