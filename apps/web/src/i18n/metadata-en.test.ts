import { expect, test } from 'vitest'
import { metadataFor, publicMetadata, structuredDataFor } from '../route-metadata'

test('every public page has translated metadata while retaining its existing canonical path', () => {
	for (const page of publicMetadata) {
		const english = metadataFor(page.path, 'en')
		expect(english.path).toBe(page.path)
		expect(english.language).toBe('en')
		expect(english.title).not.toBe(page.title)
		expect(english.description).not.toBe(page.description)
		expect(structuredDataFor(english).inLanguage).toBe('en')
		expect(metadataFor(page.path).language).toBe('fr')
	}
	expect(metadataFor('/installation/', 'en').title).toBe('Install the mod — Minemories')
	expect(metadataFor('/share/private-token', 'en')).toMatchObject({
		indexable: false,
		language: 'en',
		title: 'Minemories — Your space',
	})
})

test('sign-in and registration pages have their own title but stay private', () => {
	expect(metadataFor('/login')).toMatchObject({ title: 'Connexion — Minemories', indexable: false })
	expect(metadataFor('/register/')).toMatchObject({ title: 'Créer un compte — Minemories', indexable: false })
	expect(metadataFor('/login', 'en').title).toBe('Sign in — Minemories')
	expect(publicMetadata.some(page => page.path === '/login' || page.path === '/register')).toBe(false)
})
