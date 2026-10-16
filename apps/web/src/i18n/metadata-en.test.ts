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
